package api

import (
	"fmt"
	"math"
	"strconv"
	"strings"
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

	// Normalize route_id format (e.g. 13C -> route_13c)
	routeID = strings.ToLower(routeID)
	if !strings.HasPrefix(routeID, "route_") {
		if routeID == "mybus_srp" || routeID == "mybus" {
			routeID = "route_mybus_1"
		} else {
			routeID = "route_" + routeID
		}
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

	// Allow frontend to override with Cebu-time detection
	if isPeakOverride := c.Query("is_peak"); isPeakOverride != "" {
		if parsed, err := strconv.ParseBool(isPeakOverride); err == nil {
			isPeak = parsed
		}
	}

	var alpha, beta float64
	if isPeak {
		alpha = 0.15
		beta = 4.0
	} else {
		alpha = 0.10
		beta = 3.0
	}

	// Accept optional weather beta adjustment
	if weatherBetaStr := c.Query("weather_beta"); weatherBetaStr != "" {
		if wb, err := strconv.ParseFloat(weatherBetaStr, 64); err == nil && wb >= 0 {
			beta = wb
		}
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

// GetRoutesServing returns all routes whose physical shape passes near both the
// origin and destination — direct geometric matches across every route that has
// geometry, including ones absent from the Dijkstra schedule graph.
// GET /api/v1/routes/serving?origin_lat=&origin_lon=&dest_lat=&dest_lon=&radius=600
func (h *RoutingHandler) GetRoutesServing(c *fiber.Ctx) error {
	oLat, err1 := strconv.ParseFloat(c.Query("origin_lat"), 64)
	oLon, err2 := strconv.ParseFloat(c.Query("origin_lon"), 64)
	dLat, err3 := strconv.ParseFloat(c.Query("dest_lat"), 64)
	dLon, err4 := strconv.ParseFloat(c.Query("dest_lon"), 64)
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "origin_lat, origin_lon, dest_lat, dest_lon are required floats",
		})
	}

	radius, err := strconv.ParseFloat(c.Query("radius", "600"), 64)
	if err != nil || radius <= 0 {
		radius = 600
	}

	serving, err := h.Repo.FindRoutesServingOD(oLat, oLon, dLat, dLon, radius)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to find serving routes: %v", err),
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"serving":            serving,
		"searchRadiusMeters": radius,
	})
}

// GetAllRoutes lists every route that has geometry (for the browse-all view).
// GET /api/v1/routes
func (h *RoutingHandler) GetAllRoutes(c *fiber.Ctx) error {
	routes, err := h.Repo.FetchAllRoutes()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to list routes: %v", err),
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{"routes": routes})
}

// GetRoutesPassing returns routes whose shape passes near a single point —
// "which jeepneys/buses go through here?".
// GET /api/v1/routes/passing?lat=10.297&lon=123.899&radius=600
func (h *RoutingHandler) GetRoutesPassing(c *fiber.Ctx) error {
	lat, err1 := strconv.ParseFloat(c.Query("lat"), 64)
	lon, err2 := strconv.ParseFloat(c.Query("lon"), 64)
	if err1 != nil || err2 != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "lat and lon are required floats",
		})
	}

	radius, err := strconv.ParseFloat(c.Query("radius", "600"), 64)
	if err != nil || radius <= 0 {
		radius = 600
	}

	routes, err := h.Repo.FindRoutesPassing(lat, lon, radius)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to find passing routes: %v", err),
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"routes":             routes,
		"searchRadiusMeters": radius,
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

	// Normalize route_id format (e.g. 13C -> route_13c)
	routeID = strings.ToLower(routeID)
	if !strings.HasPrefix(routeID, "route_") {
		if routeID == "mybus_srp" || routeID == "mybus" {
			routeID = "route_mybus_1"
		} else {
			routeID = "route_" + routeID
		}
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

	// Normalize route_id format (e.g. 13C -> route_13c)
	routeID = strings.ToLower(routeID)
	if !strings.HasPrefix(routeID, "route_") {
		if routeID == "mybus_srp" || routeID == "mybus" {
			routeID = "route_mybus_1"
		} else {
			routeID = "route_" + routeID
		}
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

// GetConductorInfo returns conductor and vehicle type metadata for cultural intelligence.
// GET /api/v1/route/conductor?route_id=route_13c
func (h *RoutingHandler) GetConductorInfo(c *fiber.Ctx) error {
	routeID := c.Query("route_id")
	if routeID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing 'route_id' query parameter",
		})
	}

	routeID = strings.ToLower(routeID)
	if !strings.HasPrefix(routeID, "route_") {
		if routeID == "mybus_srp" || routeID == "mybus" {
			routeID = "route_mybus_1"
		} else {
			routeID = "route_" + routeID
		}
	}

	hasConductor, isModernized, hasAircon, err := h.Repo.FetchRouteConductorInfo(routeID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": fmt.Sprintf("Conductor info not found: %v", err),
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"route_id":       routeID,
		"has_conductor":  hasConductor,
		"is_modernized":  isModernized,
		"has_aircon":     hasAircon,
	})
}


