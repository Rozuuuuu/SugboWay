# SugboWay Final Hardening & Cultural Bridge — Implementation Plan (Revised)

A systematic plan to close Phase 5 (UI/UX) and implement Phase 6 (Deployment & Sustainability) for SugboWay. This revision incorporates all amendments from the senior engineering audit: corrected PMTiles filename, fixed stop ordering query, parallelized frontend fetches, and schema gap patch.

---

## User Review Required

> [!IMPORTANT]
> **Database Migrations**: The `seed_lptrp.sql` file will be extended with `INSERT` statements for `route_shapes` and `UPDATE` statements linking `trips.shape_id` to those shapes. A defensive `ALTER TABLE` adds the `has_aircon` column to `routes` if missing. These are all additive — no destructive `DROP` operations.

> [!IMPORTANT]
> **Go Interface Change**: Two new methods (`FetchRouteShape`, `FetchRouteStops`) will be added to `SpatialRepositoryPort`. This is a **breaking interface change** — the mock in `dijkstra_test.go` must be updated simultaneously, or `go test` will fail.

> [!WARNING]
> **Route ID Format**: The seed SQL uses the format `route_13c`, `route_17b`, etc. The existing database must have matching `route_id` values. If the format differs (e.g., `13C` vs `route_13c`), the `UPDATE trips SET shape_id` statements will silently match zero rows. This must be verified against the live database before execution.

---

## Proposed Changes

### Component 1: Go Routing API — Shape & Stop Endpoints

Extends the spatial repository port with two new data-fetching methods and exposes them as REST endpoints. Bridges GTFS `route_shapes` geometry and per-route stop lists to the frontend map renderer.

---

#### [MODIFY] [ports.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/domain/ports.go)

Add two new methods to `SpatialRepositoryPort`:

```diff
 type SpatialRepositoryPort interface {
     FindNearbyStops(lat, lon float64, radiusMeters float64) ([]GTFSStop, error)
     FetchAllStops() ([]GTFSStop, error)
     FetchGraphEdges() ([]GraphEdge, error)
     FetchRouteCongestionParams(routeID string) (int, string, int, error)
+    FetchRouteShape(routeID string) (string, error)
+    FetchRouteStops(routeID string) ([]GTFSStop, error)
 }
```

- `FetchRouteShape` — returns a GeoJSON string from `ST_AsGeoJSON(rs.geom)` for the route's linked `shape_id`.
- `FetchRouteStops` — returns all stops served by a given `route_id`, **ordered by `stop_sequence`** (amended from original).

---

#### [MODIFY] [postgres.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/adapter/repository/postgres.go)

Implement the two new repository methods at the end of the file:

**`FetchRouteShape`** — Joins `trips` → `route_shapes` on `shape_id` to retrieve PostGIS geometry as GeoJSON:

```go
func (r *PostgresSpatialRepository) FetchRouteShape(routeID string) (string, error) {
    ctx := context.Background()
    query := `
        SELECT ST_AsGeoJSON(rs.geom)
        FROM route_shapes rs
        JOIN trips t ON t.shape_id = rs.shape_id
        WHERE t.route_id = $1
        LIMIT 1;
    `
    var geoJSON string
    err := r.Pool.QueryRow(ctx, query, routeID).Scan(&geoJSON)
    if err != nil {
        return "", fmt.Errorf("route shape not found for %s: %w", routeID, err)
    }
    return geoJSON, nil
}
```

**`FetchRouteStops`** — Retrieves stops for a route, **correctly ordered by `MIN(stop_sequence)`** (amended: the original `DISTINCT ON ... ORDER BY stop_id` would sort alphabetically, not along the route):

```go
func (r *PostgresSpatialRepository) FetchRouteStops(routeID string) ([]domain.GTFSStop, error) {
    ctx := context.Background()
    query := `
        SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon,
               s.wheelchair_boarding, s.has_shelter, s.is_terminal
        FROM stops s
        JOIN stop_times st ON s.stop_id = st.stop_id
        JOIN trips t ON st.trip_id = t.trip_id
        WHERE t.route_id = $1
        GROUP BY s.stop_id, s.stop_name, s.stop_lat, s.stop_lon,
                 s.wheelchair_boarding, s.has_shelter, s.is_terminal
        ORDER BY MIN(st.stop_sequence);
    `
    rows, err := r.Pool.Query(ctx, query, routeID)
    if err != nil {
        return nil, fmt.Errorf("failed to fetch stops for route %s: %w", routeID, err)
    }
    defer rows.Close()

    var stops []domain.GTFSStop
    for rows.Next() {
        var s domain.GTFSStop
        var wc int
        if err := rows.Scan(&s.StopID, &s.StopName, &s.Location.Lat, &s.Location.Lon,
            &wc, &s.HasShelter, &s.IsTerminal); err != nil {
            return nil, fmt.Errorf("failed to scan route stop: %w", err)
        }
        s.WheelchairAccessible = (wc != 2)
        s.Aliases = []string{}
        s.RouteIDs = []string{routeID}
        stops = append(stops, s)
    }
    return stops, nil
}
```

> [!NOTE]
> **Amendment rationale**: Using `GROUP BY ... ORDER BY MIN(st.stop_sequence)` ensures stops are returned in the physical along-route order (Talamban → Ramos → Colon), not alphabetical order. This is critical for correct intermediate stop marker rendering on the map.

---

#### [MODIFY] [handler.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/adapter/api/handler.go)

Add two new handler methods after the existing `GetCongestion` handler:

**`GetRouteShape`** — `GET /api/v1/route/shape?route_id=route_13c`:

```go
// GetRouteShape returns the PostGIS GeoJSON geometry for a route's spatial path.
// GET /api/v1/route/shape?route_id=route_13c
func (h *RoutingHandler) GetRouteShape(c *fiber.Ctx) error {
    routeID := c.Query("route_id")
    if routeID == "" {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
            "error": "Missing 'route_id' query parameter",
        })
    }
    geoJSON, err := h.Repo.FetchRouteShape(routeID)
    if err != nil {
        return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
            "error": fmt.Sprintf("Shape not found: %v", err),
        })
    }
    return c.Status(fiber.StatusOK).JSON(fiber.Map{
        "route_id": routeID,
        "geojson":  geoJSON,
    })
}
```

**`GetRouteStops`** — `GET /api/v1/route/stops?route_id=route_13c`:

```go
// GetRouteStops returns the ordered list of stops served by a specific route.
// GET /api/v1/route/stops?route_id=route_13c
func (h *RoutingHandler) GetRouteStops(c *fiber.Ctx) error {
    routeID := c.Query("route_id")
    if routeID == "" {
        return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
            "error": "Missing 'route_id' query parameter",
        })
    }
    stops, err := h.Repo.FetchRouteStops(routeID)
    if err != nil {
        return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
            "error": fmt.Sprintf("Failed to fetch route stops: %v", err),
        })
    }
    return c.Status(fiber.StatusOK).JSON(fiber.Map{
        "route_id": routeID,
        "stops":    stops,
    })
}
```

---

#### [MODIFY] [main.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/main.go)

Register the two new endpoints on the API group (after line 68):

```diff
 apiGroup.Get("/stops/nearby", routingHandler.GetNearbyStops)
 apiGroup.Get("/route/search", routingHandler.SearchRoute)
 apiGroup.Get("/congestion", routingHandler.GetCongestion)
+apiGroup.Get("/route/shape", routingHandler.GetRouteShape)
+apiGroup.Get("/route/stops", routingHandler.GetRouteStops)
```

---

#### [MODIFY] [dijkstra_test.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/domain/dijkstra_test.go)

Add stub implementations to `MockSpatialRepository` (after line 27) so it satisfies the updated interface:

```go
func (m *MockSpatialRepository) FetchRouteShape(routeID string) (string, error) {
    return `{"type":"LineString","coordinates":[[123.9181,10.3705],[123.9020,10.3150],[123.9016,10.2985]]}`, nil
}

func (m *MockSpatialRepository) FetchRouteStops(routeID string) ([]GTFSStop, error) {
    return m.Stops, nil
}
```

---

### Component 2: Database Migrations — Route Shapes & Schema Hardening

Seeds PostGIS `LineString` geometries for all 6 Metro Cebu routes and links trips to their shapes. Also patches the `has_aircon` schema gap.

---

#### [MODIFY] [seed_lptrp.sql](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/adapter/repository/seed_lptrp.sql)

Append the following blocks at the end of the file:

```sql
-- 7. Defensive schema patch: ensure has_aircon column exists on routes table
-- (FetchGraphEdges in postgres.go scans this column, but schema.sql may not include it)
ALTER TABLE routes ADD COLUMN IF NOT EXISTS has_aircon BOOLEAN DEFAULT FALSE;

-- 8. Seed route shapes with realistic Metro Cebu polylines
INSERT INTO route_shapes (shape_id, geom) VALUES
    ('shape_13c', ST_GeogFromText('SRID=4326;LINESTRING(123.9181 10.3705, 123.9150 10.3550, 123.9100 10.3400, 123.9050 10.3250, 123.9020 10.3150, 123.9016 10.2985)')),
    ('shape_17b', ST_GeogFromText('SRID=4326;LINESTRING(123.9048 10.3392, 123.9030 10.3300, 123.9025 10.3200, 123.9020 10.3100, 123.9022 10.2979)')),
    ('shape_mybus_1', ST_GeogFromText('SRID=4326;LINESTRING(123.8809 10.2818, 123.8850 10.2900, 123.8900 10.2980, 123.8950 10.3050, 123.9054 10.3178)')),
    ('shape_04l', ST_GeogFromText('SRID=4326;LINESTRING(123.8973 10.3308, 123.9000 10.3290, 123.9061 10.3298, 123.9100 10.3200, 123.9183 10.3117)')),
    ('shape_12l', ST_GeogFromText('SRID=4326;LINESTRING(123.8821 10.2995, 123.8900 10.2974, 123.8997 10.2974, 123.9048 10.3182)')),
    ('shape_62b', ST_GeogFromText('SRID=4326;LINESTRING(123.9260 10.3950, 123.9200 10.3800, 123.9169 10.3662, 123.9100 10.3400, 123.9016 10.2902)'))
ON CONFLICT (shape_id) DO NOTHING;

-- 9. Link existing trips to their route shapes
UPDATE trips SET shape_id = 'shape_13c' WHERE route_id = 'route_13c' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_17b' WHERE route_id = 'route_17b' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_mybus_1' WHERE route_id = 'route_mybus_1' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_04l' WHERE route_id = 'route_04l' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_12l' WHERE route_id = 'route_12l' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_62b' WHERE route_id = 'route_62b' AND shape_id IS NULL;
```

> [!NOTE]
> **Amendment**: Added `ALTER TABLE routes ADD COLUMN IF NOT EXISTS has_aircon` to patch the schema gap where [postgres.go:194](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/adapter/repository/postgres.go#L194) scans `has_aircon` but [schema.sql](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/adapter/repository/schema.sql#L49-L61) may not define it.

---

### Component 3: Next.js Frontend — Route-Aware Map Rendering

Enhances the map drawing logic to fetch real route shape geometries and per-route stop markers from the Go API. Creates the offline PMTiles style JSON for dead-zone resilience.

---

#### [MODIFY] [page.tsx](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-web/src/app/page.tsx)

**Change 1 (Lines ~575-690)**: Rewrite `drawOnMap` as `async` with **parallelized `Promise.all` fetches** (amended: the original plan had sequential awaits which would create a visible UI delay):

```typescript
const drawOnMap = async () => {
  // Clean up previous layers and markers
  if (map.getLayer("route-line")) map.removeLayer("route-line");
  if (map.getSource("route-source")) map.removeSource("route-source");
  const markers = document.querySelectorAll(".maplibregl-marker");
  markers.forEach((m) => m.remove());

  if (selectedRouteIdx === null) return;
  const selectedRoute = routes[selectedRouteIdx];
  if (!selectedRoute) return;

  // Parallel fetch: shape geometry + intermediate stops for all transit legs
  const transitLegs = selectedRoute.legs.filter(
    (leg) => leg.type === "transit" && leg.routeId
  );

  const [shapeResults, stopResults] = await Promise.all([
    // Fetch shapes for all transit legs in parallel
    Promise.allSettled(
      transitLegs.map((leg) =>
        fetch(`${ROUTING_API_URL}/api/v1/route/shape?route_id=${leg.routeId}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    ),
    // Fetch stops for all transit legs in parallel
    Promise.allSettled(
      transitLegs.map((leg) =>
        fetch(`${ROUTING_API_URL}/api/v1/route/stops?route_id=${leg.routeId}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    ),
  ]);

  // Build GeoJSON features from fetched shapes (with fallback)
  let shapeFeatures: any[] = [];
  shapeResults.forEach((result) => {
    if (result.status === "fulfilled" && result.value?.geojson) {
      try {
        const parsed = JSON.parse(result.value.geojson);
        shapeFeatures.push({ type: "Feature", geometry: parsed });
      } catch { /* skip malformed */ }
    }
  });

  // Fallback: straight-line interpolation from stop coordinates
  if (shapeFeatures.length === 0) {
    const coordinates: [number, number][] = [];
    selectedRoute.legs.forEach((leg) => {
      coordinates.push([leg.fromStop.location.lon, leg.fromStop.location.lat]);
      coordinates.push([leg.toStop.location.lon, leg.toStop.location.lat]);
    });
    shapeFeatures = [{
      type: "Feature",
      geometry: { type: "LineString", coordinates },
    }];
  }

  const geoJson = { type: "FeatureCollection", features: shapeFeatures };

  // Draw route polyline
  map.addSource("route-source", { type: "geojson", data: geoJson as any });
  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route-source",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#0056B3", "line-width": 6, "line-opacity": 0.85 },
  });

  // Render boarding/alighting stop markers (existing logic preserved)
  selectedRoute.legs.forEach((leg) => {
    const elFrom = document.createElement("div");
    const crowdScore = leg.fromStop.crowdingScore ?? 0.22;
    const colorClass = crowdScore > 0.8 ? "bg-error" : crowdScore > 0.5 ? "bg-alert-amber" : "bg-safe-green";
    elFrom.className = `w-4 h-4 rounded-full border-2 border-white shadow-md ${colorClass}`;
    new maplibregl.Marker(elFrom)
      .setLngLat([leg.fromStop.location.lon, leg.fromStop.location.lat])
      .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(
        `<h6><b>${leg.fromStop.stopName}</b></h6><p>Crowding: ${Math.round(crowdScore * 100)}%</p>`
      ))
      .addTo(map);

    const elTo = document.createElement("div");
    const toCrowdScore = leg.toStop.crowdingScore ?? 0.22;
    const toColorClass = toCrowdScore > 0.8 ? "bg-error" : toCrowdScore > 0.5 ? "bg-alert-amber" : "bg-safe-green";
    elTo.className = `w-4 h-4 rounded-full border-2 border-white shadow-md ${toColorClass}`;
    new maplibregl.Marker(elTo)
      .setLngLat([leg.toStop.location.lon, leg.toStop.location.lat])
      .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(
        `<h6><b>${leg.toStop.stopName}</b></h6><p>Crowding: ${Math.round(toCrowdScore * 100)}%</p>`
      ))
      .addTo(map);
  });

  // Render intermediate stop markers from fetched per-route stops
  stopResults.forEach((result) => {
    if (result.status === "fulfilled" && result.value?.stops) {
      const routeStops = result.value.stops || [];
      routeStops.forEach((stop: any) => {
        const el = document.createElement("div");
        el.className = "w-3 h-3 rounded-full bg-cebu-blue/60 border border-white shadow-sm";
        new maplibregl.Marker(el)
          .setLngLat([stop.location.lon, stop.location.lat])
          .setPopup(new maplibregl.Popup({ offset: 8 }).setHTML(`<b>${stop.stopName}</b>`))
          .addTo(map);
      });
    }
  });

  // Fit map bounds to route geometry
  try {
    const coords: [number, number][] = [];
    geoJson.features.forEach((feat: any) => {
      if (feat.geometry?.type === "LineString" && feat.geometry?.coordinates) {
        coords.push(...feat.geometry.coordinates);
      }
    });
    if (coords.length > 0) {
      const bounds = coords.reduce(
        (b, coord) => b.extend(coord),
        new maplibregl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
    }
  } catch { /* fallback gracefully */ }
};
```

**Change 2**: Update `drawOnMap` invocation since it's now `async`:

```diff
     if (map.isStyleLoaded()) {
-      drawOnMap();
+      drawOnMap().catch(console.error);
     } else {
-      map.once("style.load", drawOnMap);
+      map.once("style.load", () => drawOnMap().catch(console.error));
     }
```

> [!NOTE]
> **Amendment rationale**: Using `Promise.all` + `Promise.allSettled` fetches shape geometry AND stop lists for ALL transit legs in parallel. The original sequential approach would cause `N × RTT` latency (where N = number of legs). The settled variant ensures one failing fetch doesn't crash the others.

---

#### [NEW] [offline-style.json](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-web/public/offline-style.json)

Create an offline MapLibre style pointing to the **existing `cebu-tiles.pmtiles`** file (amended: original plan used `cebu-metro.pmtiles` which doesn't match the actual file in `public/`):

```json
{
  "version": 8,
  "name": "SugboWay Offline",
  "sources": {
    "cebu-offline": {
      "type": "vector",
      "url": "pmtiles:///cebu-tiles.pmtiles"
    }
  },
  "layers": [
    {
      "id": "background",
      "type": "background",
      "paint": { "background-color": "#1a1a2e" }
    },
    {
      "id": "water",
      "type": "fill",
      "source": "cebu-offline",
      "source-layer": "water",
      "paint": { "fill-color": "#16213e" }
    },
    {
      "id": "roads",
      "type": "line",
      "source": "cebu-offline",
      "source-layer": "transportation",
      "paint": {
        "line-color": "#334155",
        "line-width": 1.5
      }
    },
    {
      "id": "buildings",
      "type": "fill",
      "source": "cebu-offline",
      "source-layer": "building",
      "paint": {
        "fill-color": "#1e293b",
        "fill-opacity": 0.6
      }
    },
    {
      "id": "labels",
      "type": "symbol",
      "source": "cebu-offline",
      "source-layer": "place",
      "layout": {
        "text-field": "{name}",
        "text-size": 11
      },
      "paint": {
        "text-color": "#94a3b8",
        "text-halo-color": "#0f172a",
        "text-halo-width": 1
      }
    }
  ]
}
```

> [!NOTE]
> **Amendment**: Changed `cebu-metro.pmtiles` → `cebu-tiles.pmtiles` to match the actual file at [cebu-tiles.pmtiles](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-web/public/cebu-tiles.pmtiles).

---

### Component 4: AI Service — Quota Transparency Headers

Exposes remaining quota in standard HTTP response headers for frontend consumption.

---

#### [MODIFY] [main.py](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-ai-service/main.py)

Add `X-RateLimit-Remaining` and `X-RateLimit-Reset` response headers to the chat endpoint success path (around line 92):

```diff
     try:
         from agent.orchestrator import process_message
         reply = process_message(request.message)
-        return {"reply": reply, "remaining": remaining}
+        response = JSONResponse(content={"reply": reply, "remaining": remaining})
+        response.headers["X-RateLimit-Remaining"] = str(remaining)
+        response.headers["X-RateLimit-Reset"] = "3600"
+        return response
     except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))
```

---

## Summary of Amendments from Original Plan

| # | Issue | Original | Revised |
|---|---|---|---|
| 1 | **PMTiles filename** | `cebu-metro.pmtiles` | `cebu-tiles.pmtiles` (matches actual file) |
| 2 | **Stop ordering** | `DISTINCT ON (stop_id) ORDER BY stop_id` | `GROUP BY ... ORDER BY MIN(stop_sequence)` |
| 3 | **Frontend fetch pattern** | Sequential `await` per leg | `Promise.all` + `Promise.allSettled` parallelization |
| 4 | **Schema gap** | Not addressed | `ALTER TABLE routes ADD COLUMN IF NOT EXISTS has_aircon` |
| 5 | **Route ID warning** | Not flagged | Added explicit warning about `route_13c` vs `13C` format |

---

## Verification Plan

### Automated Tests

1. **Go Test Suite** (validates interface compliance):
   ```bash
   cd sugboway-routing-api && go test ./domain/... -v
   ```
   Must pass with the new `FetchRouteShape` and `FetchRouteStops` mock stubs.

2. **Next.js Production Build** (validates TypeScript compilation):
   ```bash
   cd sugboway-web && npm run build
   ```
   Must complete with zero type errors.

### Manual Verification

1. **Shape Endpoint Smoke Test**:
   ```bash
   curl "https://sugboway-routing-api.onrender.com/api/v1/route/shape?route_id=route_13c"
   ```
   Expected: JSON with `geojson` field containing a `LineString`.

2. **Route Stops Endpoint** (verify sequence ordering):
   ```bash
   curl "https://sugboway-routing-api.onrender.com/api/v1/route/stops?route_id=route_13c"
   ```
   Expected: JSON with `stops` array in route-order: Talamban → Ramos → Colon (not alphabetical).

3. **Map Visual Verification**:
   - Open the Next.js app and select Route 13C (Talamban → Colon).
   - Verify the route polyline follows the real road path, not a straight line.
   - Verify small blue intermediate stop dots appear along the polyline.
   - Verify boarding/alighting markers retain crowding color coding.

4. **Offline Fallback Test**:
   - Open Chrome DevTools → Network → toggle "Offline".
   - Verify the map switches to the dark offline style with `cebu-tiles.pmtiles` without crashing.
   - Verify the "Offline Map Mode" amber banner appears in the map overlay.

5. **AI Rate Limit Headers**:
   - Send 5 chat messages, verify `X-RateLimit-Remaining` header decrements from 4 to 0.
   - On the 6th message, verify 429 response with `reset_seconds`.

6. **Parallel Fetch Performance**:
   - Open Chrome DevTools → Network → filter by `/route/shape` and `/route/stops`.
   - Verify that shape and stop requests for a multi-leg route fire simultaneously (not sequentially).
