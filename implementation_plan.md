# SugboWay Backend & Routing Engine (Go/PostGIS) — Phase 2 Implementation Plan

This plan documents the architecture, database schema, graph engine implementation, and API handlers for the SugboWay Go transit routing backend.

---

## User Review Required

> [!IMPORTANT]
> **External Environment & Go Tooling**: The local Windows terminal does not have Go installed directly on the path, but the codebase will be scaffolded as a standard Go modules repository ready to run inside the Docker-compose ecosystem defined in `SKILLS.md` §8.2.

> [!IMPORTANT]
> **PostGIS Schema Compatibility**: The schema is specifically modeled to align with `gtfs-sql-importer` schemas while adding custom geometries (`GEOGRAPHY` types for stops and shapes) and spatial indexes (`GIST`) for high-speed proximity searches.

---

## Open Questions

> [!NOTE]
> **Dijkstra Weight Mode**: The core router needs to support multiple user preferences (minimize walking, minimize transfers, minimize fare, minimize time). Our graph weights will dynamically scale edge costs during relaxation:
> - **Time Mode**: Edge cost is the duration in seconds.
> - **Transfers Mode**: A large penalty (e.g., 300s/5 min) is added to transit-to-transit transfer edges.
> - **Fare Mode**: Edges will scale costs based on LTFRB distance-based pricing.
> - **Walking Mode**: Pedestrian walking edges will have a multipliers to strongly penalize long walks.

---

## Proposed Changes

We will introduce a new project directory `sugboway-routing-api/` at the workspace root containing the complete hexagonal service.

### 1. Database & Geospatial Engineering

#### [NEW] [schema.sql](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/adapter/repository/schema.sql)
SQL schema setup for GTFS tables with custom spatial geometries and GIST indexing:
- `stops`: stop_id, stop_name, stop_lat, stop_lon, location (GEOGRAPHY(Point, 4326)), and attributes.
- `routes`: route_id, route_short_name, route_long_name, route_type, etc.
- `trips` & `stop_times`: linking schedules to trace stop sequences.
- `shapes` & `route_shapes`: geom (GEOGRAPHY(LineString, 4326)) for map rendering.

#### [NEW] [queries.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/adapter/repository/queries.go)
PostgreSQL query functions implementing database ports:
- **Proximity Search**: Uses `ST_DWithin` and `ST_Distance` on the `location::geography` point to grab nearby stops within a 500-meter radius, sorting by proximity.
- **Graph Ingestion**: Query to pull all stop sequences from `stop_times.txt` and `trips.txt` to compile standard transit graph edges.

---

### 2. Core Domain Engine (Hexagonal Core)

#### [NEW] [models.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/domain/models.go)
Framework-agnostic Go structs defining:
- `Coordinate`
- `Stop`, `Route`, `Leg`, `RouteResult`
- `RoutePrefs` (Time, Transfers, Fare, Walking toggles)

#### [NEW] [fare.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/domain/fare.go)
Deterministic Cebu fare calculation rules:
- ₱13.00 base fare for the first 4 kilometers.
- ₱2.00–₱3.00 per kilometer surcharge depending on E-Jeepney/Modern vs Traditional route type.
- 20% discount multiplier (0.80) for Student, PWD, and Senior passenger selections.
- Express fare override for specific routeIds (e.g., SM Seaside–Ayala).

#### [NEW] [dijkstra.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/domain/dijkstra.go)
Modified Dijkstra algorithm with transfer penalties using Go's `container/heap` priority queue:
- **Nodes**: GTFS stops and proximate pedestrian junction nodes.
- **Edges**: Transit edges, walk edges, and transfer edges (with a configurable penalty of 300s/5 min).
- Dynamic weights depending on user preferences (`minimize`).

#### [NEW] [ports.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/domain/ports.go)
Decoupled interfaces defining repository data retrieval actions and routing endpoints.

---

### 3. API & Adapters (Go Fiber)

#### [NEW] [handler.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/adapter/api/handler.go)
Fiber controllers to handle incoming REST requests:
- `/api/v1/stops/nearby`: Coordinates-based ST_DWithin query returning nearby stop structures.
- `/api/v1/route/search`: Processes origin/destination pins and preferences, calling the Dijkstra engine and returning the structured JSON Contextual Fence response.

#### [NEW] [main.go](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/main.go)
Boots the Go Fiber application, binds database drivers (`pgx`), injects adapters into domain ports, and starts the server.

---

## Verification Plan

### Automated Verification
- Write a Go unit test suite (`dijkstra_test.go` and `fare_test.go`) covering Dijkstra traversal, transfer penalties, and deterministic LTFRB fare metrics.
- Ensure that the syntax compiles perfectly and dependencies are tracked cleanly in `go.mod`.

### Manual Verification
- Verify the SQL files contain valid PostGIS queries (`ST_DWithin`, `ST_Distance`) snapping coordinates to geographic points.
