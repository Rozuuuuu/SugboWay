-- SugboWay Spatial Database Schema
-- Compatible with gtfs-sql-importer and customized for high-speed PostGIS 3.4 spatial queries.
-- Binds GTFS relational models to geographic coordinates.

-- Enable PostGIS spatial extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Agency Registry
CREATE TABLE IF NOT EXISTS agency (
    agency_id        TEXT PRIMARY KEY,
    agency_name      TEXT NOT NULL,
    agency_url       TEXT,
    agency_timezone  TEXT NOT NULL,
    agency_lang      TEXT,
    agency_phone     TEXT
);

-- 2. GTFS Stops with Geography Point column
CREATE TABLE IF NOT EXISTS stops (
    stop_id               TEXT PRIMARY KEY,
    stop_name             TEXT NOT NULL,
    stop_desc             TEXT,
    stop_lat              DOUBLE PRECISION NOT NULL,
    stop_lon              DOUBLE PRECISION NOT NULL,
    location              GEOGRAPHY(Point, 4326), -- Spatial column (WGS84)
    wheelchair_boarding   SMALLINT DEFAULT 0,     -- 0 = No info, 1 = Accessible, 2 = Not
    has_shelter           BOOLEAN DEFAULT FALSE,
    is_terminal           BOOLEAN DEFAULT FALSE
);

-- Spatial index on location geography for fast proximity bounding queries
CREATE INDEX IF NOT EXISTS idx_stops_location ON stops USING GIST(location);

-- Trigger to automatically populate the location geography column on stop inserts/updates
CREATE OR REPLACE FUNCTION update_stop_location()
RETURNS TRIGGER AS $$
BEGIN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.stop_lon, NEW.stop_lat), 4326)::geography;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_update_stop_location
BEFORE INSERT OR UPDATE OF stop_lat, stop_lon ON stops
FOR EACH ROW
EXECUTE FUNCTION update_stop_location();

-- 3. GTFS Routes with customized modernization tags
CREATE TABLE IF NOT EXISTS routes (
    route_id               TEXT PRIMARY KEY,
    agency_id              TEXT REFERENCES agency(agency_id),
    route_short_name       TEXT NOT NULL,
    route_long_name        TEXT NOT NULL,
    route_type             INTEGER NOT NULL, -- 3 = Bus, etc.
    route_color            TEXT,
    is_modernized          BOOLEAN DEFAULT FALSE,
    has_aircon             BOOLEAN DEFAULT FALSE,
    has_conductor          BOOLEAN DEFAULT TRUE,
    daily_passenger_volume INTEGER DEFAULT 5000,
    road_type              TEXT DEFAULT 'national',
    road_capacity          INTEGER DEFAULT 5000
);

-- 4. Trips
CREATE TABLE IF NOT EXISTS trips (
    trip_id       TEXT PRIMARY KEY,
    route_id      TEXT REFERENCES routes(route_id),
    service_id    TEXT NOT NULL,
    trip_headsign TEXT,
    direction_id  SMALLINT,
    shape_id      TEXT
);

-- 5. Stop Times for sequential schedules
CREATE TABLE IF NOT EXISTS stop_times (
    trip_id             TEXT REFERENCES trips(trip_id),
    arrival_time        TEXT NOT NULL, -- HH:MM:SS format
    departure_time      TEXT NOT NULL,
    stop_id             TEXT REFERENCES stops(stop_id),
    stop_sequence       INTEGER NOT NULL,
    shape_dist_traveled DOUBLE PRECISION,
    PRIMARY KEY (trip_id, stop_sequence)
);

CREATE INDEX IF NOT EXISTS idx_stop_times_stop_id ON stop_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_trip_id ON stop_times(trip_id);

-- 6. Route Shapes
CREATE TABLE IF NOT EXISTS route_shapes (
    shape_id  TEXT PRIMARY KEY,
    geom      GEOGRAPHY(LineString, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_route_shapes_geom ON route_shapes USING GIST(geom);
