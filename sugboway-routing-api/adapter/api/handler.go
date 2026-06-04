package api

import (
	"fmt"
	"math"
	"strconv"
	"time"

	"sugboway-routing-api/domain"

	"github.com/gofiber/fiber/v2"
)

// RoutingHandler manages HTTP routes for the SugboWay Fiber application.
type RoutingHandler struct {
	Repo           domain.SpatialRepositoryPort
	RoutingService domain.RoutingServicePort
}

// NewRoutingHandler creates a new handler.
func NewRoutingHandler(repo domain.SpatialRepositoryPort, svc domain.RoutingServicePort) *RoutingHandler {
	return &RoutingHandler{
		Repo:           repo,
		RoutingService: svc,
	}
}

// GetNearbyStops handles coordinates-based spatial ST_DWithin stops requests.
// GET /api/v1/stops/nearby?lat=10.3298&lon=123.9061&radius=500
func (h *RoutingHandler) GetNearbyStops(c *fiber.Ctx) error {
	latStr := c.Query("lat")
	lonStr := c.Query("lon")
	radiusStr := c.Query("radius", "500")

	if latStr == "" || lonStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing coordinates parameters 'lat' and 'lon'",
		})
	}

	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid 'lat' float coordinate"})
	}

	lon, err := strconv.ParseFloat(lonStr, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid 'lon' float coordinate"})
	}

	radius, err := strconv.ParseFloat(radiusStr, 64)
	if err != nil {
		radius = 500.0
	}

	stops, err := h.Repo.FindNearbyStops(lat, lon, radius)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed query for nearby stops: %v", err),
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"nearbyStops":         stops,
		"searchRadiusMeters":  radius,
		"userLocation":        fiber.Map{"lat": lat, "lon": lon},
		"timestamp":           "2026-05-25T12:00:00Z", // Standards timestamp
	})
}

// SearchRoute processes Dijkstra route computations snapped to origin/destination coordinates.
// GET /api/v1/route/search?origin_lat=10.3705&origin_lon=123.9181&dest_lat=10.2985&dest_lon=123.9016&minimize=time&passenger_type=regular
func (h *RoutingHandler) SearchRoute(c *fiber.Ctx) error {
	oLatStr := c.Query("origin_lat")
	oLonStr := c.Query("origin_lon")
	dLatStr := c.Query("dest_lat")
	dLonStr := c.Query("dest_lon")

	if oLatStr == "" || oLonStr == "" || dLatStr == "" || dLonStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing query coordinates. Origin and destination lat/lon are required.",
		})
	}

	oLat, err := strconv.ParseFloat(oLatStr, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid 'origin_lat'"})
	}
	oLon, err := strconv.ParseFloat(oLonStr, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid 'origin_lon'"})
	}
	dLat, err := strconv.ParseFloat(dLatStr, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid 'dest_lat'"})
	}
	dLon, err := strconv.ParseFloat(dLonStr, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid 'dest_lon'"})
	}

	// Read preferences
	minimizeVal := domain.RouteMinimize(c.Query("minimize", "time"))
	passTypeVal := domain.PassengerType(c.Query("passenger_type", "regular"))
	maxWalkVal, _ := strconv.ParseFloat(c.Query("max_walk", "500"), 64)
	accessModeVal, _ := strconv.ParseBool(c.Query("accessible", "false"))
	safetyModeVal, _ := strconv.ParseBool(c.Query("safety_mode", "false"))
	if accessModeVal {
		safetyModeVal = true
	}

	prefs := domain.RoutePrefs{
		Minimize:          minimizeVal,
		PassengerType:     passTypeVal,
		MaxWalkingMeters:  maxWalkVal,
		AccessibilityMode: accessModeVal,
		SafetyMode:        safetyModeVal,
		AvoidRoutes:       []string{},
	}

	origin := domain.Coordinate{Lat: oLat, Lon: oLon}
	destination := domain.Coordinate{Lat: dLat, Lon: dLon}

	results, err := h.RoutingService.FindBestRoutes(origin, destination, prefs)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Graph routing calculation failed: %v", err),
		})
	}

	// Contextual Fence verification
	if len(results) == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":      "No route options found within search parameters.",
			"code":       "NO_ROUTE_FOUND",
			"suggestion": "Consider increasing walking radius preferences or checking standard bus terminal routes.",
		})
	}

	return c.Status(fiber.StatusOK).JSON(results)
}

// GetCongestion calculates the BPR dynamic congestion variables and crowding level for a route.
// GET /api/v1/congestion?route_id=route_13c&departure_time=2026-05-25T18:00:00Z
func (h *RoutingHandler) GetCongestion(c *fiber.Ctx) error {
	routeID := c.Query("route_id")
	depTimeStr := c.Query("departure_time")

	if routeID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing 'route_id' query parameter",
		})
	}

	pv, roadType, roadCapacity, err := h.Repo.FetchRouteCongestionParams(routeID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": fmt.Sprintf("Route not found or database error: %v", err),
		})
	}

	var depTime time.Time
	if depTimeStr != "" {
		depTime, err = time.Parse(time.RFC3339, depTimeStr)
		if err != nil {
			depTime = time.Now()
		}
	} else {
		depTime = time.Now()
	}

	hour := depTime.Hour()
	isPeak := (hour >= 7 && hour < 9) || (hour >= 17 && hour < 20)

	var alpha, beta float64
	if isPeak {
		alpha = 0.15
		beta = 4.0
	} else {
		alpha = 0.10
		beta = 3.0
	}

	capacity := float64(roadCapacity)
	if capacity <= 0 {
		capacity = 5000.0
	}

	flowRatio := float64(pv) / capacity
	congestionFactor := alpha * math.Pow(flowRatio, beta)
	timeMultiplier := 1.0 + congestionFactor

	var crowding string
	if flowRatio > 1.0 && isPeak {
		crowding = "HIGH"
	} else if flowRatio > 0.6 {
		crowding = "MEDIUM"
	} else {
		crowding = "LOW"
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"route_id":               routeID,
		"is_peak":                isPeak,
		"daily_passenger_volume": pv,
		"road_type":              roadType,
		"capacity":               capacity,
		"flow_ratio":             flowRatio,
		"crowding":               crowding,
		"time_multiplier":        timeMultiplier,
	})
}

// GetRouteShape returns the PostGIS GeoJSON geometry for a route's spatial path.
// GET /api/v1/route/shape?route_id=route_13c
func (h *RoutingHandler) GetRouteShape(c *fiber.Ctx) error {
	routeID := c.Query("route_id")
	if routeID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing 'route_id' query parameter",
		})
	}
	geoJSON, err := h.Repo.FetchRouteShape(routeID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": fmt.Sprintf("Shape not found: %v", err),
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"route_id": routeID,
		"geojson":  geoJSON,
	})
}

// GetRouteStops returns the ordered list of stops served by a specific route.
// GET /api/v1/route/stops?route_id=route_13c
func (h *RoutingHandler) GetRouteStops(c *fiber.Ctx) error {
	routeID := c.Query("route_id")
	if routeID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing 'route_id' query parameter",
		})
	}
	stops, err := h.Repo.FetchRouteStops(routeID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to fetch route stops: %v", err),
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"route_id": routeID,
		"stops":    stops,
	})
}

