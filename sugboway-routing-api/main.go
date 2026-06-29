package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sugboway-routing-api/adapter/api"
	"sugboway-routing-api/adapter/email"
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
		// Local development default. In production (Render/Neon) set DATABASE_URL.
		dbConnStr = "postgresql://postgres:postgres@localhost:5432/sugboway"
		log.Println("[SugboWay Routing API] DATABASE_URL not set — using localhost default.")
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

	// 2b. Auto-apply pending DB migrations on boot (runs on every Render deploy).
	// Set RUN_MIGRATIONS=false to skip (e.g. if migrations are managed elsewhere).
	if os.Getenv("RUN_MIGRATIONS") != "false" {
		log.Println("[SugboWay Routing API] Running database migrations...")
		if err := repository.RunMigrations(context.Background(), repo.Pool); err != nil {
			log.Fatalf("Fatal: database migration failed: %v", err)
		}
	}

	// 3. Inject Repository into Dijkstra Graph Core Engine
	routingService := domain.NewDijkstraRoutingEngine(repo)

	// 4. Construct API Handler Adapters
	routingHandler := api.NewRoutingHandler(repo, routingService)

	// Auth: config from env (shared JWT secret with the AI service).
	jwtSecret := os.Getenv("AUTH_JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "dev-insecure-secret-change-me"
		log.Println("[SugboWay Routing API] WARNING: AUTH_JWT_SECRET not set — using an insecure dev default. Set it in production.")
	}
	appBaseURL := envOr("APP_BASE_URL", "http://localhost:3000")
	publicAPIURL := envOr("PUBLIC_API_URL", "http://localhost:8080")

	userStore := repository.NewPostgresUserStore(repo.Pool)
	mailSender := email.NewSMTPSender(
		os.Getenv("SMTP_HOST"), envOr("SMTP_PORT", "587"),
		os.Getenv("SMTP_USER"), os.Getenv("SMTP_PASS"),
		envOr("SMTP_FROM", "SugboWay <no-reply@sugboway.app>"),
	)
	authHandler := api.NewAuthHandler(userStore, mailSender, api.AuthConfig{
		JWTSecret: jwtSecret, AppBaseURL: appBaseURL, PublicAPIURL: publicAPIURL,
		TokenTTL: 7 * 24 * time.Hour, VerifyTTL: 24 * time.Hour,
	})

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
	apiGroup.Get("/routes/serving", routingHandler.GetRoutesServing)
	apiGroup.Get("/routes", routingHandler.GetAllRoutes)
	apiGroup.Get("/routes/passing", routingHandler.GetRoutesPassing)
	apiGroup.Get("/congestion", routingHandler.GetCongestion)
	apiGroup.Get("/route/shape", routingHandler.GetRouteShape)
	apiGroup.Get("/route/stops", routingHandler.GetRouteStops)
	apiGroup.Get("/route/conductor", routingHandler.GetConductorInfo)

	authGroup := app.Group("/api/v1/auth")
	authGroup.Post("/register", authHandler.Register)
	authGroup.Get("/verify", authHandler.Verify)
	authGroup.Post("/resend", authHandler.Resend)
	authGroup.Post("/login", authHandler.Login)
	authGroup.Post("/upgrade", authHandler.RequireAuth, authHandler.Upgrade)
	authGroup.Get("/me", authHandler.RequireAuth, authHandler.Me)

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

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
