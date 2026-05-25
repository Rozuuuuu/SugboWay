-- SugboWay GTFS Seed Data
-- Demo Routes for Cebu City (13C, 17B, MyBus)

-- 1. Agency
INSERT INTO agency (agency_id, agency_name, agency_url, agency_timezone) 
VALUES 
    ('CCT', 'Cebu City Transit', 'https://cebucity.gov.ph', 'Asia/Manila'),
    ('MYB', 'SM MyBus', 'https://www.mybus.ph', 'Asia/Manila')
ON CONFLICT (agency_id) DO NOTHING;

-- 2. Stops (Coordinates are approx Cebu City locations)
INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon)
VALUES
    ('stop_talamban', 'Talamban Gym', 10.3662, 123.9169),
    ('stop_uc_banilad', 'UC Banilad', 10.3429, 123.9118),
    ('stop_it_park', 'Cebu IT Park (Terminal)', 10.3292, 123.9067),
    ('stop_ayala', 'Ayala Center Cebu PUV Terminal', 10.3182, 123.9048),
    ('stop_colon', 'Colon Obelisk', 10.2974, 123.8997),
    ('stop_seaside', 'SM Seaside City Cebu', 10.2818, 123.8805),
    ('stop_lahug', 'Lahug (JY Square)', 10.3308, 123.8973)
ON CONFLICT (stop_id) DO NOTHING;

-- 3. Routes
INSERT INTO routes (route_id, agency_id, route_short_name, route_long_name, route_type, is_modernized, daily_passenger_volume, road_type)
VALUES
    ('route_13c', 'CCT', '13C', 'Talamban - Colon via Banilad', 3, false, 11763, 'national'),
    ('route_17b', 'CCT', '17B', 'Lahug - Colon via Jones', 3, true, 8000, 'barangay'),
    ('route_mybus_1', 'MYB', 'MyBus', 'SM Seaside to IT Park', 700, true, 11782, 'national')
ON CONFLICT (route_id) DO NOTHING;

-- 4. Trips
INSERT INTO trips (trip_id, route_id, service_id, trip_headsign)
VALUES
    ('trip_13c_south', 'route_13c', 'all_days', 'Colon'),
    ('trip_17b_south', 'route_17b', 'all_days', 'Colon'),
    ('trip_mybus_north', 'route_mybus_1', 'all_days', 'IT Park')
ON CONFLICT (trip_id) DO NOTHING;

-- 5. Stop Times
INSERT INTO stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence)
VALUES
    -- 13C Southbound
    ('trip_13c_south', '08:00:00', '08:05:00', 'stop_talamban', 1),
    ('trip_13c_south', '08:15:00', '08:16:00', 'stop_uc_banilad', 2),
    ('trip_13c_south', '08:25:00', '08:28:00', 'stop_ayala', 3),
    ('trip_13c_south', '08:45:00', '08:50:00', 'stop_colon', 4),

    -- 17B Southbound
    ('trip_17b_south', '08:00:00', '08:05:00', 'stop_lahug', 1),
    ('trip_17b_south', '08:20:00', '08:25:00', 'stop_colon', 2),

    -- MyBus Northbound
    ('trip_mybus_north', '08:00:00', '08:10:00', 'stop_seaside', 1),
    ('trip_mybus_north', '08:30:00', '08:35:00', 'stop_it_park', 2)
ON CONFLICT (trip_id, stop_sequence) DO NOTHING;
