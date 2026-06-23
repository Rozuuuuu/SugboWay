# Route corridor ingestion

How to grow `route_shapes` from the 8 baseline corridors toward the full ~40
LPTRP corridors, using real source geometry only.

## Pieces

| File | Role |
|------|------|
| `0002_lptrp_corridors.sql` | Migration template. Ships the 8 known-good corridors and marks where generated ones get appended. |
| `../../../../parse_kmz.py` (repo root) | Converts a KMZ/KML/GeoJSON of routes into `route_shapes` INSERTs + `trips` UPDATEs. Emits only coordinates found in the source — never invents geometry. |
| `../seed_lptrp.sql` | Original seed; the 8 baseline corridors here are kept in sync with the migration. |

## Workflow

1. **Get a source file.** Export the corridors from the reference map
   (e.g. the `cebujeepneyroute` KMZ, or any KML/GeoJSON of LineStrings).

2. **Generate SQL:**
   ```bash
   python parse_kmz.py corridors.kmz --out generated_corridors.sql --emit-snap
   ```
   Optionally pass `--mapping mapping.json` to control `shape_id`/`route_id`:
   ```json
   { "13C Talamban–Colon": { "shape_id": "shape_13c", "route_id": "route_13c" } }
   ```
   Names not in the mapping fall back to a slug of the placemark name.

3. **Review.** The generator prints each imported corridor and its point count
   to stderr. Confirm coverage and sanity-check a couple of polylines on a map.

4. **Append** the reviewed INSERT/UPDATE statements into the marked section of
   `0002_lptrp_corridors.sql`.

5. **Apply** with `seed_runner.py` or `psql`:
   ```bash
   psql "$DATABASE_URL" -f adapter/repository/migrations/0002_lptrp_corridors.sql
   ```

## Live source: cebujeepneys.weebly.com (already wired)

`0003_weebly_real_shapes.sql` is generated from the community jeepney map at
cebujeepneys.weebly.com, whose per-route Google "My Maps" contain hand-traced,
road-following polylines. Regenerate or extend it with:

```bash
python scrape_weebly_routes.py 13c 04l 17b 12l 62b 01b 03b 10m \
  --out adapter/repository/migrations/0003_weebly_real_shapes.sql
```

The scraper saves each route's `.kmz` under `data/routes/` and replaces the
coarse seed geometry via `ON CONFLICT (shape_id) DO UPDATE SET geom`. This data
is **CC BY-NC 3.0** — see `data/routes/SOURCES.md` for attribution and the
NonCommercial caveat.

## Optional: road-grid snapping

For higher-fidelity tracking, snap each vertex to the nearest OSM node with
`ST_ClosestPoint`. This needs an `osm_nodes(geom geometry(Point,4326))` table
loaded from OSM data. The snapping query ships **commented out** at the bottom
of the migration (and via `--emit-snap`) — load OSM data and review before
enabling it.

## What is intentionally NOT automated

Fabricating coordinates. If a route has no geometry in the source file, it is
reported and skipped rather than guessed. The frontend already falls back to a
straight line between stops for any route whose shape is missing, so skipped
corridors degrade gracefully instead of showing fake paths.
