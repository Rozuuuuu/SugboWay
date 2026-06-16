package domain

import (
	"testing"
)

// MockSpatialRepository mocks spatial queries for unit testing the graph router.
type MockSpatialRepository struct {
	Stops []GTFSStop
	Edges []GraphEdge
}

func (m *MockSpatialRepository) FindNearbyStops(lat, lon float64, radiusMeters float64) ([]GTFSStop, error) {
	return m.Stops, nil
}

func (m *MockSpatialRepository) FetchAllStops() ([]GTFSStop, error) {
	return m.Stops, nil
}

func (m *MockSpatialRepository) FetchGraphEdges() ([]GraphEdge, error) {
	return m.Edges, nil
}

func (m *MockSpatialRepository) FetchRouteCongestionParams(routeID string) (int, string, int, error) {
	return 10000, "national", 10000, nil
}

func (m *MockSpatialRepository) FetchRouteShape(routeID string) (string, error) {
	return `{"type":"LineString","coordinates":[[123.9181,10.3705],[123.9020,10.3150],[123.9016,10.2985]]}`, nil
}

func (m *MockSpatialRepository) FetchRouteStops(routeID string) ([]GTFSStop, error) {
	return m.Stops, nil
}

func (m *MockSpatialRepository) FetchRouteConductorInfo(routeID string) (bool, bool, bool, error) {
	return true, false, false, nil
}

func TestDijkstraSearch(t *testing.T) {
	// 1. Arrange Mock Nodes and Edges representing Cebu lines
	mockStops := []GTFSStop{
		{
			StopID:               "talamban_term",
			StopName:             "Talamban Grand Terminal",
			Location:             Coordinate{Lat: 10.3705, Lon: 123.9181},
			WheelchairAccessible: true,
		},
		{
			StopID:               "ramos_st",
			StopName:             "Ramos St Stop",
			Location:             Coordinate{Lat: 10.3150, Lon: 123.9020},
			WheelchairAccessible: true,
		},
		{
			StopID:               "colon_metro",
			StopName:             "Metro Colon Mall",
			Location:             Coordinate{Lat: 10.2985, Lon: 123.9016},
			WheelchairAccessible: true,
		},
	}

	mockEdges := []GraphEdge{
		{
			FromStopID:     "talamban_term",
			ToStopID:       "ramos_st",
			RouteID:        "13C",
			RouteShortName: "13C",
			RouteLongName:  "Talamban - Colon via Ramos",
			RouteType:      "modern_ejeep",
			IsModernized:   true,
			HasAircon:      true,
			DistanceMeters: 4000.0,
			DurationSecs:   600.0, // 10 mins
		},
		{
			FromStopID:     "ramos_st",
			ToStopID:       "colon_metro",
			RouteID:        "13C",
			RouteShortName: "13C",
			RouteLongName:  "Talamban - Colon via Ramos",
			RouteType:      "modern_ejeep",
			IsModernized:   true,
			HasAircon:      true,
			DistanceMeters: 2200.0,
			DurationSecs:   400.0, // 6.6 mins
		},
	}

	mockRepo := &MockSpatialRepository{
		Stops: mockStops,
		Edges: mockEdges,
	}

	engine := NewDijkstraRoutingEngine(mockRepo)

	// 2. Act: Perform Route Search near Talamban towards Colon
	origin := Coordinate{Lat: 10.3706, Lon: 123.9182} // Slightly offset to trigger walk snaps
	dest := Coordinate{Lat: 10.2984, Lon: 123.9015}

	prefs := RoutePrefs{
		Minimize:          MinimizeTime,
		PassengerType:     PassengerRegular,
		MaxWalkingMeters:  500.0,
		AccessibilityMode: false,
		AvoidRoutes:       []string{},
	}

	results, err := engine.FindBestRoutes(origin, dest, prefs)
	if err != nil {
		t.Fatalf("Search failed with error: %v", err)
	}

	// 3. Assert outputs
	if len(results) == 0 {
		t.Fatalf("Expected routing solutions, got 0 results")
	}

	bestResult := results[0]
	if bestResult.Transfers != 0 {
		t.Errorf("Expected 0 transfers for a direct route, got %d", bestResult.Transfers)
	}

	// Check if there are walking snapping legs
	hasWalking := false
	hasTransit := false
	for _, leg := range bestResult.Legs {
		if leg.Type == "walking" {
			hasWalking = true
		}
		if leg.Type == "transit" {
			hasTransit = true
			if leg.RouteShortName != "13C" {
				t.Errorf("Expected route 13C, got %s", leg.RouteShortName)
			}
			// Confirm deterministic leg fare: 13C is Modern (₱13.00 base + 2.2km excess * 2.50/km) = 13.00 + 5.50 = 18.50
			expectedFare := 18.50
			if leg.FarePHP != expectedFare {
				t.Errorf("Expected leg fare %f, got %f", expectedFare, leg.FarePHP)
			}
		}
	}

	if !hasWalking {
		t.Errorf("Dijkstra router failed to compile walking snap legs")
	}
	if !hasTransit {
		t.Errorf("Dijkstra router failed to compile transit legs")
	}
}
