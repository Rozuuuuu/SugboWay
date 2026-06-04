package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sugboway-routing-api/adapter/api"
	"sugboway-routing-api/adapter/repository"
	"sugboway-routing-api/domain"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

func main() {
	// 1. Load Configurations from Env Variables
	dbConnStr := os.Getenv("DATABASE_URL")
	if dbConnStr == "" {
		// Fallback to local default development address or provided render url
		dbConnStr = "postgresql://sugboway_user:icblLufDCbcAuk0KWbQdaoxyI8uU2zmF@dpg-d89tckegvqtc73cakufg-a.oregon-postgres.render.com/sugboway"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("[SugboWay Routing API] Starting on port %s...", port)

	// 2. Initialize PostgreSQL PostGIS Spatial Repository Adapter
	repo, err := repository.NewPostgresSpatialRepository(dbConnStr)
	if err != nil {
		log.Fatalf("Fatal: Database initialization failed: %v", err)
	}
	defer repo.Close()

	log.Println("[SugboWay Routing API] Database pool connection successfully established.")

	// 3. Inject Repository into Dijkstra Graph Core Engine
	routingService := domain.NewDijkstraRoutingEngine(repo)

	// 4. Construct API Handler Adapters
	routingHandler := api.NewRoutingHandler(repo, routingService)

	// 5. Scaffold Fiber Web Server
	app := fiber.New(fiber.Config{
		AppName:      "SugboWay Transit Routing Engine v1.0",
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	})

	// Inject standard middlewares (Logger and CORS)
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept",
		AllowMethods: "GET, POST, HEAD, PUT, DELETE, OPTIONS",
	}))

	// Bind endpoints matching RAG fencing specifications
	apiGroup := app.Group("/api/v1")
	apiGroup.Get("/stops/nearby", routingHandler.GetNearbyStops)
	apiGroup.Get("/route/search", routingHandler.SearchRoute)
	apiGroup.Get("/congestion", routingHandler.GetCongestion)
	apiGroup.Get("/route/shape", routingHandler.GetRouteShape)
	apiGroup.Get("/route/stops", routingHandler.GetRouteStops)

	// Direct check endpoint
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status":    "healthy",
			"timestamp": time.Now().Format(time.RFC3339),
		})
	})

	// 6. Graceful shutdown handler
	go func() {
		if err := app.Listen(":" + port); err != nil {
			log.Printf("Server closed: %v", err)
		}
	}()

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)

	<-c
	log.Println("[SugboWay Routing API] Gracefully shutting down...")
	_ = app.Shutdown()
	log.Println("[SugboWay Routing API] Server stopped.")
}
