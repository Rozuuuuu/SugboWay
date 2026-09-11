/**
 * SugboWay Hexagonal Ports
 * ========================
 * Port interfaces defining what the domain core expects from external adapters.
 *
 * Architecture rule: The AI adapter NEVER calculates routes.
 * It only interprets data retrieved from the PostGIS spatial database.
 * See SKILLS.md §4.1 for the anti-hallucination RAG protocol.
 */

import type {
  Coordinate,
  RoutePrefs,
  RouteResult,
  SpatialQueryResponse,
  AIQueryInput,
  AIQueryResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Port: Spatial Data Source
// ---------------------------------------------------------------------------

/**
 * Port for spatial data operations.
 * Implemented by the PostGIS adapter (PostgreSQL + PostGIS 3.4).
 *
 * This is the ONLY source of truth for route data.
 * The AI service must consume results from this port — never generate routes.
 */
export interface SpatialQueryPort {
  /**
   * Find stops within a radius of the user's location.
   * Uses PostGIS ST_DWithin for efficient spatial queries.
   *
   * @param location - User's current position
   * @param radiusMeters - Search radius (default: 500m)
   */
  findNearbyStops(
    location: Coordinate,
    radiusMeters: number
  ): Promise<SpatialQueryResponse>;

  /**
   * Find optimal routes between two points.
   * Uses the Go Dijkstra routing engine with transfer penalties.
   *
   * @param origin - Starting coordinate
   * @param destination - Ending coordinate
   * @param prefs - User preferences (minimize, passenger type, etc.)
   */
  findRoute(
    origin: Coordinate,
    destination: Coordinate,
    prefs: RoutePrefs
  ): Promise<RouteResult[]>;
}

// ---------------------------------------------------------------------------
// Port: AI Assistant
// ---------------------------------------------------------------------------

/**
 * Port for the AI assistant service.
 *
 * CRITICAL ANTI-HALLUCINATION RULES:
 * 1. The AI receives pre-fetched GTFS data via `gtfsContext` — it NEVER queries databases.
 * 2. If a destination is not in the GTFS stops, the AI must state it cannot find a verified route.
 * 3. All stop/route names in the response are validated against the provided context.
 * 4. The `contextFenced` flag must be `true` for valid responses.
 */
export interface AIAssistantPort {
  /**
   * Send a natural language query to the AI assistant.
   * The AI only interprets the pre-supplied GTFS context.
   *
   * @param input - Query with pre-fetched GTFS context (the "Contextual Fence")
   */
  query(input: AIQueryInput): Promise<AIQueryResponse>;
}

// ---------------------------------------------------------------------------
// Port: Crowding Data Source
// ---------------------------------------------------------------------------

/**
 * Port for real-time crowding data.
 * Implemented by a Redis-backed adapter with WebSocket push.
 */
export interface CrowdingDataPort {
  /**
   * Get current crowding score for a stop.
   * @returns Score from 0.0 (empty) to 1.0 (packed)
   */
  getStopCrowding(stopId: string): Promise<number>;

  /**
   * Get current crowding score for a route.
   */
  getRouteCrowding(routeId: string): Promise<number>;

  /**
   * Subscribe to real-time crowding updates for a route.
   * @param routeId - Route to subscribe to
   * @param callback - Called on each update (every ~30s)
   */
  subscribeCrowding(
    routeId: string,
    callback: (score: number) => void
  ): () => void; // Returns unsubscribe function
}

// ---------------------------------------------------------------------------
// Port: Offline Storage
// ---------------------------------------------------------------------------

/**
 * Port for offline data persistence.
 * Implemented by Expo SQLite on mobile, IndexedDB on web.
 */
export interface OfflineStoragePort {
  /** Get the currently cached GTFS version */
  getCachedVersion(): Promise<string | null>;

  /** Check if a newer GTFS version is available */
  checkForUpdate(): Promise<{ available: boolean; version: string }>;

  /** Download and cache the latest GTFS data */
  syncData(): Promise<void>;

  /** Query cached route data for offline routing */
  findCachedRoute(
    originStopId: string,
    destStopId: string
  ): Promise<RouteResult[] | null>;
}
