package api

import (
	"fmt"
	"strconv"

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

	prefs := domain.RoutePrefs{
		Minimize:          minimizeVal,
		PassengerType:     passTypeVal,
		MaxWalkingMeters:  maxWalkVal,
		AccessibilityMode: accessModeVal,
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
