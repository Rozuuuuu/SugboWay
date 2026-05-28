package domain

import (
	"container/heap"
	"fmt"
	"math"
	"strings"
	"time"
)

// Edge represents a directed connection between stops or walking nodes.
type Edge struct {
	ToStopID       string
	RouteID        string // Empty for walking/transfers
	RouteShortName string
	Route          *GTFSRoute
	DistanceMeters       float64
	DurationSecs         float64
	DailyPassengerVolume int
	RoadType             string
	RoadCapacity         int
	Type                 string // "transit", "walking", "transfer"
}

// Graph contains nodes and directed edges mapped by stop ID.
type Graph struct {
	Stops map[string]GTFSStop
	Edges map[string][]Edge
}

// PathStep tracks the traversal history inside the priority queue.
type PathStep struct {
	FromStopID     string
	ToStopID       string
	RouteID        string
	RouteShortName string
	DistanceMeters float64
	DurationSecs   float64
	Type           string
}

// Item describes a traversal node state in our priority queue heap.
type Item struct {
	NodeID          string
	Cost            float64
	DurationSeconds float64
	Transfers       int
	DistanceMeters  float64
	Path            []PathStep
	LastRouteID     string
	Index           int
}

// PriorityQueue implements heap.Interface and holds Items.
type PriorityQueue []*Item

func (pq PriorityQueue) Len() int           { return len(pq) }
func (pq PriorityQueue) Less(i, j int) bool { return pq[i].Cost < pq[j].Cost }
func (pq PriorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].Index = i
	pq[j].Index = j
}
func (pq *PriorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*Item)
	item.Index = n
	*pq = append(*pq, item)
}
func (pq *PriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.Index = -1
	*pq = old[0 : n-1]
	return item
}

// DijkstraRoutingEngine implements domain.RoutingServicePort.
type DijkstraRoutingEngine struct {
	Repo SpatialRepositoryPort
}

func NewDijkstraRoutingEngine(repo SpatialRepositoryPort) *DijkstraRoutingEngine {
	return &DijkstraRoutingEngine{Repo: repo}
}

func (e *DijkstraRoutingEngine) FindBestRoutes(origin, dest Coordinate, prefs RoutePrefs) ([]RouteResult, error) {
	// Contextual Fence: coordinates must be within the Metro Cebu urban core bounds [123.82, 10.25] to [123.96, 10.42]
	if origin.Lat < 10.25 || origin.Lat > 10.42 || origin.Lon < 123.82 || origin.Lon > 123.96 ||
		dest.Lat < 10.25 || dest.Lat > 10.42 || dest.Lon < 123.82 || dest.Lon > 123.96 {
		return []RouteResult{}, nil
	}

	// 1. Fetch GTFS Stops and compile schedules from PostgreSQL adapter
	stopsList, err := e.Repo.FetchAllStops()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch stops: %w", err)
	}

	edgesList, err := e.Repo.FetchGraphEdges()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch edges: %w", err)
	}

	// 2. Build the spatial Graph in memory
	graph := Graph{
		Stops: make(map[string]GTFSStop),
		Edges: make(map[string][]Edge),
	}

	for _, stop := range stopsList {
		graph.Stops[stop.StopID] = stop
	}

	for _, dbEdge := range edgesList {
		edge := Edge{
			ToStopID:       dbEdge.ToStopID,
			RouteID:        dbEdge.RouteID,
			RouteShortName: dbEdge.RouteShortName,
			Route: &GTFSRoute{
				RouteID:              dbEdge.RouteID,
				RouteShortName:       dbEdge.RouteShortName,
				RouteLongName:        dbEdge.RouteLongName,
				RouteType:            dbEdge.RouteType,
				IsModernized:         dbEdge.IsModernized,
				HasAircon:            dbEdge.HasAircon,
				DailyPassengerVolume: dbEdge.DailyPassengerVolume,
				RoadType:             dbEdge.RoadType,
				RoadCapacity:         dbEdge.RoadCapacity,
			},
			DistanceMeters:       dbEdge.DistanceMeters,
			DurationSecs:         dbEdge.DurationSecs,
			DailyPassengerVolume: dbEdge.DailyPassengerVolume,
			RoadType:             dbEdge.RoadType,
			RoadCapacity:         dbEdge.RoadCapacity,
			Type:                 "transit",
		}
		graph.Edges[dbEdge.FromStopID] = append(graph.Edges[dbEdge.FromStopID], edge)
	}

	// 3. Setup Virtual Origin and Destination nodes
	startNodeID := "VIRTUAL_START"
	endNodeID := "VIRTUAL_END"

	graph.Stops[startNodeID] = GTFSStop{
		StopID:   startNodeID,
		StopName: "Origin Location",
		Location: origin,
	}
	graph.Stops[endNodeID] = GTFSStop{
		StopID:   endNodeID,
		StopName: "Destination Location",
		Location: dest,
	}

	// Snap Virtual Nodes to actual nearby stops within walk radius (Haversine calculations)
	maxWalkMeters := prefs.MaxWalkingMeters
	if maxWalkMeters <= 0 {
		maxWalkMeters = 500.0 // Default 500m snapping
	}

	// Snapping start node to all stops within maxWalkMeters
	for stopID, stop := range graph.Stops {
		if stopID == startNodeID || stopID == endNodeID {
			continue
		}
		dist := haversineDistance(origin, stop.Location)
		if dist <= maxWalkMeters {
			// Walking speed: 1.4 m/s (standard urban pedestrian speed)
			duration := dist / 1.4
			graph.Edges[startNodeID] = append(graph.Edges[startNodeID], Edge{
				ToStopID:       stopID,
				DistanceMeters: dist,
				DurationSecs:   duration,
				Type:           "walking",
			})
		}
	}

	// Snapping all stops within maxWalkMeters to the end node
	for stopID, stop := range graph.Stops {
		if stopID == startNodeID || stopID == endNodeID {
			continue
		}
		dist := haversineDistance(stop.Location, dest)
		if dist <= maxWalkMeters {
			duration := dist / 1.4
			graph.Edges[stopID] = append(graph.Edges[stopID], Edge{
				ToStopID:       endNodeID,
				DistanceMeters: dist,
				DurationSecs:   duration,
				Type:           "walking",
			})
		}
	}

	// Direct Walk fallback: Start to End connection
	directDist := haversineDistance(origin, dest)
	if directDist <= maxWalkMeters*2 {
		graph.Edges[startNodeID] = append(graph.Edges[startNodeID], Edge{
			ToStopID:       endNodeID,
			DistanceMeters: directDist,
			DurationSecs:   directDist / 1.4,
			Type:           "walking",
		})
	}

	// Parse departure time
	var depTime time.Time
	if prefs.DepartureTime != "" {
		t, err := time.Parse(time.RFC3339, prefs.DepartureTime)
		if err == nil {
			depTime = t
		} else {
			depTime = time.Now()
		}
	} else {
		depTime = time.Now()
	}

	// 4. Run modified Dijkstra algorithm
	results := []RouteResult{}
	pq := make(PriorityQueue, 0)
	heap.Init(&pq)

	heap.Push(&pq, &Item{
		NodeID:          startNodeID,
		Cost:            0,
		DurationSeconds: 0,
		Transfers:       0,
		DistanceMeters:  0,
		Path:            []PathStep{},
		LastRouteID:     "",
	})

	// To keep track of minimum costs and avoid cycles
	visitedCost := make(map[string]float64)

	// Collect matches (up to top 3 paths to serve as candidates)
	for pq.Len() > 0 && len(results) < 3 {
		curr := heap.Pop(&pq).(*Item)

		// Destination check
		if curr.NodeID == endNodeID {
			res := e.compileResult(curr, graph, prefs.PassengerType)
			results = append(results, res)
			continue
		}

		visitedKey := fmt.Sprintf("%s:%s", curr.NodeID, curr.LastRouteID)
		if val, exists := visitedCost[visitedKey]; exists && val <= curr.Cost {
			continue
		}
		visitedCost[visitedKey] = curr.Cost

		// Relax neighbors
		for _, edge := range graph.Edges[curr.NodeID] {
			// Exclusion check
			if len(prefs.AvoidRoutes) > 0 && edge.RouteID != "" {
				avoid := false
				for _, avoidRoute := range prefs.AvoidRoutes {
					if edge.RouteID == avoidRoute {
						avoid = true
						break
					}
				}
				if avoid {
					continue
				}
			}

			// Wheelchair accessible check
			if prefs.AccessibilityMode && edge.Type == "transit" {
				targetStop := graph.Stops[edge.ToStopID]
				if !targetStop.WheelchairAccessible {
					continue
				}
			}

			// Calculate real-time duration using BPR if transit
			actualDuration := edge.DurationSecs
			if edge.Type == "transit" {
				actualDuration = CalculateBPRCost(edge.DistanceMeters, edge.DailyPassengerVolume, edge.RoadType, edge.RoadCapacity, depTime)
			}

			// Calculate edge cost weight based on user minimize preference
			edgeCost := actualDuration

			// Safety Mode adjustments: Prioritize modernized e-jeeps (Aircon/CCTV) and well-lit hubs
			if prefs.SafetyMode {
				if edge.Type == "transit" {
					if edge.Route != nil && (edge.Route.IsModernized || edge.Route.HasAircon) {
						// Favor modernized jeepneys (with Aircon/CCTV) by lowering search cost
						edgeCost = edgeCost * 0.7
					} else {
						// De-prioritize traditional jeepneys by increasing search cost
						edgeCost = edgeCost * 1.5
					}
				}
				// Prioritize well-lit hubs (IT Park, Ayala)
				if strings.Contains(strings.ToLower(edge.ToStopID), "it_park") || 
				   strings.Contains(strings.ToLower(edge.ToStopID), "ayala") {
					edgeCost = edgeCost * 0.8
				}
			}

			isTransfer := false
			transferPenalty := prefs.TransferPenaltySecs
			if transferPenalty <= 0 {
				transferPenalty = 300.0 // Default 5 min penalty
			}

			if edge.Type == "transit" && curr.LastRouteID != "" && curr.LastRouteID != edge.RouteID {
				isTransfer = true
				edgeCost += transferPenalty // Add transfer hop penalty
			}

			// Apply preference factors to edge weight cost
			switch prefs.Minimize {
			case MinimizeTransfers:
				if isTransfer {
					edgeCost += 600.0 // Extra heavy transfer penalty
				}
			case MinimizeWalking:
				if edge.Type == "walking" {
					edgeCost = edgeCost * 3.0 // Strongly penalize walking distances
				}
			case MinimizeFare:
				if edge.Type == "transit" {
					fareCost := CalculateLegFare(edge.DistanceMeters, edge.Route.RouteType, edge.RouteID, prefs.PassengerType)
					edgeCost += fareCost * 15.0 // Translate fare into search cost factor
				}
			}

			newCost := curr.Cost + edgeCost
			newDuration := curr.DurationSeconds + actualDuration
			if isTransfer {
				newDuration += 60.0 // Add a mock 60s wait time for boarding transfers
			}

			newTransfers := curr.Transfers
			if isTransfer {
				newTransfers++
			}

			newPath := make([]PathStep, len(curr.Path))
			copy(newPath, curr.Path)
			newPath = append(newPath, PathStep{
				FromStopID:     curr.NodeID,
				ToStopID:       edge.ToStopID,
				RouteID:        edge.RouteID,
				RouteShortName: edge.RouteShortName,
				DistanceMeters: edge.DistanceMeters,
				DurationSecs:   actualDuration,
				Type:           edge.Type,
			})

			heap.Push(&pq, &Item{
				NodeID:          edge.ToStopID,
				Cost:            newCost,
				DurationSeconds: newDuration,
				Transfers:       newTransfers,
				DistanceMeters:  curr.DistanceMeters + edge.DistanceMeters,
				Path:            newPath,
				LastRouteID:     edge.RouteID,
			})
		}
	}

	return results, nil
}

// compileResult translates a successful Dijkstra heap item traversal into a neat frontend contract leg sequence.
func (e *DijkstraRoutingEngine) compileResult(item *Item, graph Graph, passType PassengerType) RouteResult {
	legs := []RouteLeg{}
	var currentLeg *RouteLeg

	for _, step := range item.Path {
		// Group continuous steps with same routeID/type into single Legs
		if currentLeg == nil || currentLeg.Type != step.Type || (step.Type == "transit" && currentLeg.RouteID != step.RouteID) {
			if currentLeg != nil {
				legs = append(legs, *currentLeg)
			}

			var routeObj *GTFSRoute
			if step.Type == "transit" {
				routeObj = &GTFSRoute{
					RouteID:        step.RouteID,
					RouteShortName: step.RouteShortName,
					RouteLongName:  graph.Stops[step.ToStopID].StopName, // Placeholder or fetch
					RouteType:      "jeepney",
				}
				// Pull full route details if edge matches
				for _, edge := range graph.Edges[step.FromStopID] {
					if edge.RouteID == step.RouteID {
						routeObj = edge.Route
						break
					}
				}
			}

			currentLeg = &RouteLeg{
				Type:            step.Type,
				RouteID:         step.RouteID,
				RouteShortName:  step.RouteShortName,
				Route:           routeObj,
				FromStop:        graph.Stops[step.FromStopID],
				ToStop:          graph.Stops[step.ToStopID],
				DurationSeconds: 0,
				DistanceMeters:  0,
				Instructions:    []NavigationInstruction{},
			}
		}

		currentLeg.DurationSeconds += step.DurationSecs
		currentLeg.DistanceMeters += step.DistanceMeters
		currentLeg.ToStop = graph.Stops[step.ToStopID]
	}

	if currentLeg != nil {
		legs = append(legs, *currentLeg)
	}

	// Post-process legs: attach detailed step-by-step instructions with localized Cebuano cues and computed fares
	totalFare := 0.0
	for i := range legs {
		leg := &legs[i]
		if leg.Type == "transit" {
			fare := CalculateLegFare(leg.DistanceMeters, leg.Route.RouteType, leg.RouteID, passType)
			leg.FarePHP = fare
			totalFare += fare

			// Generate board instruction
			leg.Instructions = append(leg.Instructions, NavigationInstruction{
				Step:          1,
				Action:        "board",
				Description:   fmt.Sprintf("Board vehicle %s at %s.", leg.RouteShortName, leg.FromStop.StopName),
				CebuanoPhrase: "Plete palihug",
				CulturalCue:   "Wave palm down to flag E-Jeeps, or tap coins on ceiling rails to signal stops.",
			})

			// Ride instruction
			leg.Instructions = append(leg.Instructions, NavigationInstruction{
				Step:        2,
				Action:      "ride",
				Description: fmt.Sprintf("Ride for %s passing intermediate stations.", formatDistance(leg.DistanceMeters)),
				Landmark:    leg.ToStop.StopName,
			})

			// Alight instruction
			leg.Instructions = append(leg.Instructions, NavigationInstruction{
				Step:          3,
				Action:        "alight",
				Description:   fmt.Sprintf("Alight at %s.", leg.ToStop.StopName),
				CebuanoPhrase: "Lugar lang",
				CulturalCue:   "Clearly call out 'Lugar lang' sa unahan.",
			})
		} else {
			leg.Instructions = append(leg.Instructions, NavigationInstruction{
				Step:        1,
				Action:      "walk",
				Description: fmt.Sprintf("Walk %s to %s.", formatDistance(leg.DistanceMeters), leg.ToStop.StopName),
				Landmark:    leg.ToStop.StopName,
			})
		}
	}

	return RouteResult{
		Legs:             legs,
		TotalTimeSeconds: item.DurationSeconds,
		TotalFarePHP:     totalFare,
		Transfers:        item.Transfers,
		CrowdingWorstLeg: 0.25, // Mock safe default congestion loading
		GeoJSON:          GeoJSONFeatureCollection{Type: "FeatureCollection", Features: []GeoJSONFeature{}},
	}
}

// formatDistance prints a clean meters or kilometers representation.
func formatDistance(meters float64) string {
	if meters < 1000.0 {
		return fmt.Sprintf("%.0fm", meters)
	}
	return fmt.Sprintf("%.1fkm", meters/1000.0)
}

// haversineDistance computes distance between two geographic coordinates in meters.
func haversineDistance(c1, c2 Coordinate) float64 {
	const R = 6371000.0 // Earth radius in meters
	rad := math.Pi / 180.0
	lat1 := c1.Lat * rad
	lat2 := c2.Lat * rad
	dLat := (c2.Lat - c1.Lat) * rad
	dLon := (c2.Lon - c1.Lon) * rad

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1)*math.Cos(lat2)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return R * c
}
