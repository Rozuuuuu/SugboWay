-- ===========================================================================
-- 0002_lptrp_corridors.sql — Route track geometry for the LPTRP corridors
-- ===========================================================================
-- Populates `route_shapes` (LineString geography) and links `trips.shape_id`
-- so GET /api/v1/route/shape can serve each route's physical path.
--
-- This file starts with the 8 corridors that ship with the seed data (real,
-- hand-verified Metro Cebu polylines). To grow toward the full ~40 LPTRP
-- corridors, generate additional inserts from a KMZ/KML/GeoJSON source:
--
--     python parse_kmz.py corridors.kmz --out generated_corridors.sql --emit-snap
--
-- then paste the reviewed output into the marked section below. parse_kmz.py
-- only emits coordinates present in the source — it never fabricates geometry.
-- See scripts/README.md for the end-to-end workflow.
-- ===========================================================================

-- --- Baseline: 8 known-good corridors (kept in sync with seed_lptrp.sql) ----
INSERT INTO route_shapes (shape_id, geom) VALUES
    ('shape_13c', ST_GeogFromText('SRID=4326;LINESTRING(123.9181 10.3705, 123.9150 10.3550, 123.9100 10.3400, 123.9050 10.3250, 123.9020 10.3150, 123.9016 10.2985)')),
    ('shape_17b', ST_GeogFromText('SRID=4326;LINESTRING(123.9048 10.3392, 123.9030 10.3300, 123.9025 10.3200, 123.9020 10.3100, 123.9022 10.2979)')),
    ('shape_mybus_1', ST_GeogFromText('SRID=4326;LINESTRING(123.8809 10.2818, 123.8850 10.2900, 123.8900 10.2980, 123.8950 10.3050, 123.9054 10.3178)')),
    ('shape_04l', ST_GeogFromText('SRID=4326;LINESTRING(123.8973 10.3308, 123.9000 10.3290, 123.9061 10.3298, 123.9100 10.3200, 123.9183 10.3117)')),
    ('shape_12l', ST_GeogFromText('SRID=4326;LINESTRING(123.8821 10.2995, 123.8900 10.2974, 123.8997 10.2974, 123.9048 10.3182)')),
    ('shape_62b', ST_GeogFromText('SRID=4326;LINESTRING(123.9260 10.3950, 123.9200 10.3800, 123.9169 10.3662, 123.9100 10.3400, 123.9016 10.2902)')),
    ('shape_01b', ST_GeogFromText('SRID=4326;LINESTRING(123.8821 10.2995, 123.8890 10.3010, 123.8960 10.2990, 123.8997 10.2974, 123.9020 10.2980, 123.9070 10.3030, 123.9120 10.3050, 123.9120 10.2940, 123.9090 10.2910)')),
    ('shape_03b', ST_GeogFromText('SRID=4326;LINESTRING(123.9120 10.3220, 123.9110 10.3210, 123.9080 10.3160, 123.9020 10.3150, 123.8935 10.3117, 123.8950 10.3080, 123.8970 10.3040, 123.8980 10.3010, 123.8997 10.2974)'))
ON CONFLICT (shape_id) DO NOTHING;

UPDATE trips SET shape_id = 'shape_13c'     WHERE route_id = 'route_13c'     AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_17b'     WHERE route_id = 'route_17b'     AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_mybus_1' WHERE route_id = 'route_mybus_1' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_04l'     WHERE route_id = 'route_04l'     AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_12l'     WHERE route_id = 'route_12l'     AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_62b'     WHERE route_id = 'route_62b'     AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_01b'     WHERE route_id = 'route_01b'     AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_03b'     WHERE route_id = 'route_03b'     AND shape_id IS NULL;

-- ===========================================================================
-- >>> APPEND GENERATED CORRIDORS BELOW <<<
-- Paste the reviewed output of parse_kmz.py here (additional INSERT + UPDATE
-- statements). Do not commit machine-generated geometry without checking it
-- against the road grid first.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- OPTIONAL: snap shape vertices to the nearest OSM node for road-grid fidelity.
-- Requires an `osm_nodes(geom geometry(Point,4326))` table loaded from OSM.
-- Commented out by default — review and load OSM data before enabling.
-- ---------------------------------------------------------------------------
-- UPDATE route_shapes rs
-- SET geom = snapped.geom
-- FROM (
--   SELECT rs2.shape_id,
--          ST_MakeLine(ST_ClosestPoint(n.geom, dp.geom) ORDER BY dp.path)::geography AS geom
--   FROM route_shapes rs2,
--        LATERAL ST_DumpPoints(rs2.geom::geometry) AS dp
--   CROSS JOIN LATERAL (
--     SELECT geom FROM osm_nodes ORDER BY osm_nodes.geom <-> dp.geom LIMIT 1
--   ) AS n
--   GROUP BY rs2.shape_id
-- ) AS snapped
-- WHERE rs.shape_id = snapped.shape_id;
