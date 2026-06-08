-- SugboWay LPTRP Expansion and BPR Capacity Seeding

-- 1. Alter schema to add road_capacity column to routes
ALTER TABLE routes ADD COLUMN IF NOT EXISTS road_capacity INTEGER DEFAULT 5000;

-- 2. Clean/Update existing routes with new volumes and capacities
UPDATE routes SET daily_passenger_volume = 18500, road_type = 'urban', road_capacity = 8000 WHERE route_id = 'route_13c';
UPDATE routes SET daily_passenger_volume = 12200, road_type = 'urban', road_capacity = 6000 WHERE route_id = 'route_17b';
UPDATE routes SET daily_passenger_volume = 22000, road_type = 'national', road_capacity = 15000 WHERE route_id = 'route_mybus_1';

-- 3. Add new LPTRP stops
INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon)
VALUES
    ('stop_sm_city', 'SM City Cebu PUV Terminal', 10.3117, 123.9183),
    ('stop_labangon', 'Labangon Barangay Hall', 10.2995, 123.8821),
    ('stop_pitos', 'Pit-os Barangay Hall', 10.3950, 123.9260),
    ('stop_carbon', 'Carbon Market', 10.2902, 123.9016)
ON CONFLICT (stop_id) DO UPDATE 
SET stop_name = EXCLUDED.stop_name,
    stop_lat = EXCLUDED.stop_lat,
    stop_lon = EXCLUDED.stop_lon;

-- 4. Seed new LPTRP routes
INSERT INTO routes (route_id, agency_id, route_short_name, route_long_name, route_type, is_modernized, daily_passenger_volume, road_type, road_capacity)
VALUES
    ('route_04l', 'CCT', '04L', 'Lahug - SM City Cebu via IT Park', 3, true, 14800, 'urban', 7000),
    ('route_12l', 'CCT', '12L', 'Labangon - Ayala PUV Terminal', 3, true, 11500, 'urban', 6500),
    ('route_62b', 'CCT', '62B', 'Pit-os - Carbon via Talamban', 3, false, 9200, 'urban', 5500)
ON CONFLICT (route_id) DO UPDATE 
SET daily_passenger_volume = EXCLUDED.daily_passenger_volume,
    road_type = EXCLUDED.road_type,
    road_capacity = EXCLUDED.road_capacity;

-- 5. Seed new trips
INSERT INTO trips (trip_id, route_id, service_id, trip_headsign)
VALUES
    ('trip_04l_east', 'route_04l', 'all_days', 'SM City Cebu'),
    ('trip_12l_north', 'route_12l', 'all_days', 'Ayala Center'),
    ('trip_62b_north', 'route_62b', 'all_days', 'Carbon')
ON CONFLICT (trip_id) DO NOTHING;

-- 6. Seed new stop times
INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence)
VALUES
    -- 04L: Lahug -> IT Park -> SM City
    ('trip_04l_east', '08:00:00', '08:05:00', 'stop_lahug', 1),
    ('trip_04l_east', '08:15:00', '08:18:00', 'stop_it_park', 2),
    ('trip_04l_east', '08:35:00', '08:40:00', 'stop_sm_city', 3),

    -- 12L: Labangon -> Colon -> Ayala
    ('trip_12l_north', '08:00:00', '08:04:00', 'stop_labangon', 1),
    ('trip_12l_north', '08:15:00', '08:20:00', 'stop_colon', 2),
    ('trip_12l_north', '08:35:00', '08:40:00', 'stop_ayala', 3),

    -- 62B: Pit-os -> Talamban -> Carbon
    ('trip_62b_north', '08:00:00', '08:05:00', 'stop_pitos', 1),
    ('trip_62b_north', '08:25:00', '08:30:00', 'stop_talamban', 2),
    ('trip_62b_north', '08:50:00', '08:55:00', 'stop_carbon', 3)
ON CONFLICT (trip_id, stop_sequence) DO NOTHING;

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
    ('shape_62b', ST_GeogFromText('SRID=4326;LINESTRING(123.9260 10.3950, 123.9200 10.3800, 123.9169 10.3662, 123.9100 10.3400, 123.9016 10.2902)')),
    ('shape_01b', ST_GeogFromText('SRID=4326;LINESTRING(123.8821 10.2995, 123.8890 10.3010, 123.8960 10.2990, 123.8997 10.2974, 123.9020 10.2980, 123.9070 10.3030, 123.9120 10.3050, 123.9120 10.2940, 123.9090 10.2910)')),
    ('shape_03b', ST_GeogFromText('SRID=4326;LINESTRING(123.9120 10.3220, 123.9110 10.3210, 123.9080 10.3160, 123.9020 10.3150, 123.8935 10.3117, 123.8950 10.3080, 123.8970 10.3040, 123.8980 10.3010, 123.8997 10.2974)'))
ON CONFLICT (shape_id) DO NOTHING;

-- 9. Link existing trips to their route shapes
UPDATE trips SET shape_id = 'shape_13c' WHERE route_id = 'route_13c' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_17b' WHERE route_id = 'route_17b' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_mybus_1' WHERE route_id = 'route_mybus_1' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_04l' WHERE route_id = 'route_04l' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_12l' WHERE route_id = 'route_12l' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_62b' WHERE route_id = 'route_62b' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_01b' WHERE route_id = 'route_01b' AND shape_id IS NULL;
UPDATE trips SET shape_id = 'shape_03b' WHERE route_id = 'route_03b' AND shape_id IS NULL;
