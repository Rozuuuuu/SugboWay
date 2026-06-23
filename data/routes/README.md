# Route source files

Drop the raw geometry for Cebu jeepney/bus corridors here, then run the
ingestion pipeline to turn it into road-following `route_shapes` rows.

## Accepted formats

- `.kmz` / `.kml` — e.g. a Google My Maps export of route polylines
- `.geojson` — a FeatureCollection of `LineString` / `MultiLineString` features

Each route should be one LineString placemark/feature whose **name** is (or maps
to) the route code, e.g. `13C`, `04L`.

## Where to get "ground truth" geometry

- **Cebu Jeepney Route Guide** — 66+ PUJ route codes with high-res path maps.
- **Cebu Jeepneys Route Map** (Weebly) — Google-Maps-based polylines, useful for
  tricky downtown intersections.
- **OpenStreetMap** PTv2 route relations for Metro Cebu — export real,
  street-snapped geometry via the Overpass API (most accurate, open-licensed).

## Run the pipeline

```bash
# 1. Generate SQL from your dropped file (only emits coordinates it finds)
python parse_kmz.py data/routes/<your-file>.kmz --out generated_corridors.sql --emit-snap

# 2. Review the output, then append it into the migration:
#    sugboway-routing-api/adapter/repository/migrations/0002_lptrp_corridors.sql

# 3. Apply it
psql "$DATABASE_URL" -f sugboway-routing-api/adapter/repository/migrations/0002_lptrp_corridors.sql
```

Optionally pass `--mapping mapping.json` to control how placemark names map to
`shape_id` / `route_id`. See
[`migrations/README.md`](../../sugboway-routing-api/adapter/repository/migrations/README.md)
for the full workflow, including the optional `ST_ClosestPoint` OSM snapping step.

> The pipeline never invents geometry. Routes with no usable LineString are
> reported and skipped, and the app falls back to a straight line between stops.
