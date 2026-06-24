package domain

// GraphEdge represents a database edge loaded from GTFS trips and stop sequences
// used to build the memory graph.
type GraphEdge struct {
	FromStopID     string  `json:"fromStopId"`
	ToStopID       string  `json:"toStopId"`
	RouteID        string  `json:"routeId"`
	RouteShortName string  `json:"routeShortName"`
	RouteLongName  string  `json:"routeLongName"`
	RouteType      string  `json:"routeType"` // "jeepney", "modern_ejeep", etc.
	IsModernized         bool    `json:"isModernized"`
	HasAircon            bool    `json:"hasAircon"`
	DailyPassengerVolume int     `json:"dailyPassengerVolume"`
	RoadType             string  `json:"roadType"`
	RoadCapacity         int     `json:"roadCapacity"`
	DistanceMeters       float64 `json:"distanceMeters"`
	DurationSecs         float64 `json:"durationSecs"`
}

// ServingRoute is a route whose physical shape passes near both an origin and a
// destination — a direct geometric match, independent of the Dijkstra graph.
type ServingRoute struct {
	RouteID        string  `json:"routeId"`
	RouteShortName string  `json:"routeShortName"`
	RouteLongName  string  `json:"routeLongName"`
	IsModernized   bool    `json:"isModernized"`
	HasAircon      bool    `json:"hasAircon"`
	HasConductor   bool    `json:"hasConductor"`
	DistanceMeters float64 `json:"distanceMeters"`
}

// RouteSummary describes a whole route for the "browse all routes" view. It
// includes the shape's start/end coordinates so the UI can render a card (and
// its map track) without an extra round-trip.
type RouteSummary struct {
	RouteID        string  `json:"routeId"`
	RouteShortName string  `json:"routeShortName"`
	RouteLongName  string  `json:"routeLongName"`
	IsModernized   bool    `json:"isModernized"`
	HasAircon      bool    `json:"hasAircon"`
	HasConductor   bool    `json:"hasConductor"`
	DistanceMeters float64 `json:"distanceMeters"`
	StartLat       float64 `json:"startLat"`
	StartLon       float64 `json:"startLon"`
	EndLat         float64 `json:"endLat"`
	EndLon         float64 `json:"endLon"`
}

// SpatialRepositoryPort defines what the Dijkstra engine needs from our PostGIS database.
type SpatialRepositoryPort interface {
	// FindNearbyStops locates all stops within a given radius using ST_DWithin and ST_Distance
	FindNearbyStops(lat, lon float64, radiusMeters float64) ([]GTFSStop, error)

	// FetchAllStops loads stop node details to populate graph nodes
	FetchAllStops() ([]GTFSStop, error)

	// FetchGraphEdges loads routing edges based on GTFS schedules (stop_times & trips)
	FetchGraphEdges() ([]GraphEdge, error)

	// FetchRouteCongestionParams fetches BPR dynamic congestion variables
	FetchRouteCongestionParams(routeID string) (int, string, int, error)

	// FetchRouteShape returns a GeoJSON representation of a route's shape
	FetchRouteShape(routeID string) (string, error)

	// FetchRouteStops returns the ordered list of stops served by a specific route
	FetchRouteStops(routeID string) ([]GTFSStop, error)

	// FindRoutesServingOD returns routes whose shape passes within radiusMeters of
	// BOTH the origin and destination — direct geometric matches across all routes
	// that have geometry, even ones not present in the Dijkstra schedule graph.
	FindRoutesServingOD(oLat, oLon, dLat, dLon, radiusMeters float64) ([]ServingRoute, error)

	// FetchAllRoutes returns every route that has geometry, for the browse-all view.
	FetchAllRoutes() ([]RouteSummary, error)

	// FindRoutesPassing returns routes whose shape passes within radiusMeters of a
	// single point — "which routes go through here?".
	FindRoutesPassing(lat, lon, radiusMeters float64) ([]RouteSummary, error)

	// FetchRouteConductorInfo returns whether a route has a conductor and is modernized
	FetchRouteConductorInfo(routeID string) (hasConductor bool, isModernized bool, hasAircon bool, err error)
}

// RoutingServicePort specifies the core transit query functions exposed to our API layers.
type RoutingServicePort interface {
	// FindBestRoutes calculates paths snapped to start/end locations matching preferences
	FindBestRoutes(origin, destination Coordinate, prefs RoutePrefs) ([]RouteResult, error)
}
