package repository

import (
	"context"
	"fmt"
	"strings"

	"sugboway-routing-api/domain"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresSpatialRepository implements domain.SpatialRepositoryPort.
type PostgresSpatialRepository struct {
	Pool *pgxpool.Pool
}

// NewPostgresSpatialRepository establishes a pool connection.
func NewPostgresSpatialRepository(connStr string) (*PostgresSpatialRepository, error) {
	config, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return nil, fmt.Errorf("unable to parse connection string: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("unable to create connection pool: %w", err)
	}

	return &PostgresSpatialRepository{Pool: pool}, nil
}

// Close gracefully releases pool connections.
func (r *PostgresSpatialRepository) Close() {
	if r.Pool != nil {
		r.Pool.Close()
	}
}

// FindNearbyStops queries all stops within radiusMeters of a latitude/longitude pair
// utilizing PostGIS's high-speed ST_DWithin geography index.
func (r *PostgresSpatialRepository) FindNearbyStops(lat, lon float64, radiusMeters float64) ([]domain.GTFSStop, error) {
	ctx := context.Background()

	// Proximity SQL Query using ST_DWithin and ST_Distance
	query := `
		SELECT 
			stop_id, 
			stop_name, 
			stop_lat, 
			stop_lon, 
			wheelchair_boarding, 
			has_shelter, 
			is_terminal
		FROM stops
		WHERE ST_DWithin(
			location, 
			ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, 
			$3
		)
		ORDER BY ST_Distance(
			location, 
			ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
		);
	`

	rows, err := r.Pool.Query(ctx, query, lat, lon, radiusMeters)
	if err != nil {
		return nil, fmt.Errorf("nearby stops query failed: %w", err)
	}
	defer rows.Close()

	var stops []domain.GTFSStop
	for rows.Next() {
		var s domain.GTFSStop
		var wc int
		err := rows.Scan(
			&s.StopID,
			&s.StopName,
			&s.Location.Lat,
			&s.Location.Lon,
			&wc,
			&s.HasShelter,
			&s.IsTerminal,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan stop row: %w", err)
		}
		s.WheelchairAccessible = (wc != 2)
		s.Aliases = []string{}
		s.RouteIDs = []string{}
		stops = append(stops, s)
	}

	if len(stops) == 0 {
		return []domain.GTFSStop{}, nil
	}

	// Map route IDs serving these nearby stops
	return r.attachRouteIDs(stops)
}

// FetchAllStops returns all stop nodes.
func (r *PostgresSpatialRepository) FetchAllStops() ([]domain.GTFSStop, error) {
	ctx := context.Background()
	query := `
		SELECT 
			stop_id, 
			stop_name, 
			stop_lat, 
			stop_lon, 
			wheelchair_boarding, 
			has_shelter, 
			is_terminal
		FROM stops;
	`
	rows, err := r.Pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("fetch all stops failed: %w", err)
	}
	defer rows.Close()

	var stops []domain.GTFSStop
	for rows.Next() {
		var s domain.GTFSStop
		var wc int
		err := rows.Scan(
			&s.StopID,
			&s.StopName,
			&s.Location.Lat,
			&s.Location.Lon,
			&wc,
			&s.HasShelter,
			&s.IsTerminal,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan stop: %w", err)
		}
		s.WheelchairAccessible = (wc != 2)
		s.Aliases = []string{}
		s.RouteIDs = []string{}
		stops = append(stops, s)
	}

	return r.attachRouteIDs(stops)
}

// FetchGraphEdges compiles the transit graph edges matching stop sequences on trips.
func (r *PostgresSpatialRepository) FetchGraphEdges() ([]domain.GraphEdge, error) {
	ctx := context.Background()

	// High-performance sequential join matching sequential steps inside active trips
	query := `
		SELECT 
			st1.stop_id AS from_stop_id,
			st2.stop_id AS to_stop_id,
			t.route_id,
			r.route_short_name,
			r.route_long_name,
			r.route_type,
			r.is_modernized,
			r.has_aircon,
			r.daily_passenger_volume,
			r.road_type,
			r.road_capacity,
			ST_Distance(s1.location, s2.location) AS distance_meters,
			ST_Distance(s1.location, s2.location) / 8.0 AS duration_secs
		FROM stop_times st1
		JOIN stop_times st2 ON st1.trip_id = st2.trip_id AND st2.stop_sequence = st1.stop_sequence + 1
		JOIN trips t ON st1.trip_id = t.trip_id
		JOIN routes r ON t.route_id = r.route_id
		JOIN stops s1 ON st1.stop_id = s1.stop_id
		JOIN stops s2 ON st2.stop_id = s2.stop_id;
	`

	rows, err := r.Pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch graph edges: %w", err)
	}
	defer rows.Close()

	var edges []domain.GraphEdge
	for rows.Next() {
		var e domain.GraphEdge
		var rType int
		err := rows.Scan(
			&e.FromStopID,
			&e.ToStopID,
			&e.RouteID,
			&e.RouteShortName,
			&e.RouteLongName,
			&rType,
			&e.IsModernized,
			&e.HasAircon,
			&e.DailyPassengerVolume,
			&e.RoadType,
			&e.RoadCapacity,
			&e.DistanceMeters,
			&e.DurationSecs,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan edge row: %w", err)
		}

		// Translate standard GTFS route type integers into string classifications
		e.RouteType = "jeepney"
		if rType == 3 {
			if e.IsModernized {
				e.RouteType = "modern_ejeep"
			} else {
				e.RouteType = "jeepney"
			}
		} else if rType == 700 {
			e.RouteType = "bus"
		}
		// Special route short-name mappings
		if strings.Contains(strings.ToLower(e.RouteShortName), "mybus") {
			e.RouteType = "mybus"
		} else if strings.Contains(strings.ToLower(e.RouteShortName), "ceres") {
			e.RouteType = "ceres"
		}

		edges = append(edges, e)
	}

	return edges, nil
}

// attachRouteIDs aggregates active route attachments for all loaded stop objects.
func (r *PostgresSpatialRepository) attachRouteIDs(stops []domain.GTFSStop) ([]domain.GTFSStop, error) {
	if len(stops) == 0 {
		return stops, nil
	}

	ctx := context.Background()
	query := `
		SELECT DISTINCT st.stop_id, t.route_id 
		FROM stop_times st
		JOIN trips t ON st.trip_id = t.trip_id;
	`
	rows, err := r.Pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed serving stops-routes query: %w", err)
	}
	defer rows.Close()

	stopRoutesMap := make(map[string][]string)
	for rows.Next() {
		var stopID, routeID string
		if err := rows.Scan(&stopID, &routeID); err == nil {
			stopRoutesMap[stopID] = append(stopRoutesMap[stopID], routeID)
		}
	}

	for i := range stops {
		if rIDs, exists := stopRoutesMap[stops[i].StopID]; exists {
			stops[i].RouteIDs = rIDs
		}
	}

	return stops, nil
}

// FetchRouteCongestionParams queries the routes table for passenger volume, road type, and road capacity.
func (r *PostgresSpatialRepository) FetchRouteCongestionParams(routeID string) (int, string, int, error) {
	ctx := context.Background()
	query := `
		SELECT daily_passenger_volume, road_type, road_capacity 
		FROM routes 
		WHERE route_id = $1;
	`
	var pv int
	var roadType string
	var roadCapacity int
	err := r.Pool.QueryRow(ctx, query, routeID).Scan(&pv, &roadType, &roadCapacity)
	if err != nil {
		return 0, "", 0, err
	}
	return pv, roadType, roadCapacity, nil
}

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

