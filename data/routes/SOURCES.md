# Route geometry sources & attribution

The `.kmz` files in this folder, and the geometry generated from them in
`sugboway-routing-api/adapter/repository/migrations/0003_weebly_real_shapes.sql`,
are derived from a community-made map:

- **Source:** Cebu Jeepney Routes — https://cebujeepneys.weebly.com
- **License:** Creative Commons **BY-NC 3.0**
  (Attribution — NonCommercial). See https://creativecommons.org/licenses/by-nc/3.0/

Each route page on that site embeds a Google "My Maps" whose hand-traced
polylines follow the actual streets. `scrape_weebly_routes.py` resolves each
map to its KMZ export and parses the LineStrings into PostGIS geometry.

## ⚠️ NonCommercial clause

The **NC** term means this geometry may be used for non-commercial purposes with
attribution. SugboWay's "Premium" tier is currently a front-end demo with no real
billing — but **before any commercial deployment**, either:

- obtain permission / a commercial license from the source author, or
- replace this geometry with an openly-licensed source such as **OpenStreetMap**
  PTv2 route relations (ODbL), exportable via the Overpass API.

The ingestion pipeline (`parse_kmz.py`, `scrape_weebly_routes.py`) is
source-agnostic, so swapping in OSM-derived geometry later requires no code
changes — only a different input file.

## Regenerating

```bash
python scrape_weebly_routes.py 13c 04l 17b 12l 62b 01b 03b 10m \
  --out sugboway-routing-api/adapter/repository/migrations/0003_weebly_real_shapes.sql
```
