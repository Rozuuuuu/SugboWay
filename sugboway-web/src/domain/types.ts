/**
 * SugboWay Domain Types
 * =====================
 * Framework-agnostic TypeScript interfaces for the Cebu transit system.
 * These types form the core of the Hexagonal Architecture — zero dependencies.
 *
 * Based on GTFS specification + Cebu-specific extensions defined in SKILLS.md §2–3.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** WGS84 coordinate pair */
export interface Coordinate {
  lat: number;
  lon: number;
}

/** Transit vehicle / route classification */
export type RouteType =
  | "jeepney"
  | "modern_ejeep"
  | "mybus"
  | "ceres"
  | "bus";

/** Passenger discount category per LTFRB regulations */
export type PassengerType = "regular" | "student" | "senior" | "pwd";

/** Route optimization preference */
export type RouteMinimize = "time" | "transfers" | "fare" | "walking";

/** Navigation step action */
export type NavigationAction =
  | "walk"
  | "board"
  | "ride"
  | "alight"
  | "transfer"
  | "wait";

/** Route leg type */
export type LegType = "transit" | "walking";

/** Crowding classification levels (maps to BPR output) */
export type CrowdingLevel = "comfortable" | "moderate" | "crowded" | "packed";

// ---------------------------------------------------------------------------
// GTFS Domain Models
// ---------------------------------------------------------------------------

/**
 * A GTFS route representing a jeepney/bus line in Cebu.
 * Maps to `routes.txt` with Cebu-specific extensions.
 */
export interface GTFSRoute {
  /** Unique route identifier, e.g., "13C" */
  routeId: string;

  /** Short display name for badges, e.g., "13C", "04L", "17B" */
  routeShortName: string;

  /** Full descriptive name, e.g., "Talamban - Colon via Ramos" */
  routeLongName: string;

  /** Vehicle classification */
  routeType: RouteType;

  /** Operating agency/franchise holder */
  agencyId: string;

  /** Optional hex color for route visualization */
  routeColor?: string;

  /** Whether this is a modernized (LPTRP-compliant) vehicle */
  isModernized: boolean;

  /** Whether the vehicle has air conditioning */
  hasAircon: boolean;
}

/** Alias to match phase 5 domain blueprint */
export type TransitRoute = GTFSRoute;

/**
 * A GTFS stop / station in the Cebu transit network.
 * Maps to `stops.txt` with spatial and crowding extensions.
 */
export interface GTFSStop {
  /** Unique stop identifier */
  stopId: string;

  /** Official stop name */
  stopName: string;

  /** Alias names for fuzzy matching (Cebuano, Filipino, English variants) */
  aliases: string[];

  /** Geographic position (WGS84) */
  location: Coordinate;

  /** Route IDs serving this stop */
  routeIds: string[];

  /** Real-time crowding score from BPR model (0.0 = empty, 1.0 = packed) */
  crowdingScore?: number;

  /** ADA/PWD wheelchair accessibility */
  wheelchairAccessible: boolean;

  /** Whether the stop has a covered shelter */
  hasShelter: boolean;

  /** Whether this stop is a route terminal/endpoint */
  isTerminal: boolean;
}

// ---------------------------------------------------------------------------
// Spatial Query Models
// ---------------------------------------------------------------------------

/**
 * Response from the PostGIS spatial adapter for nearby stop queries.
 * See SKILLS.md §3.1 for the underlying SQL (ST_DWithin).
 */
export interface SpatialQueryResponse {
  /** Stops found within the search radius */
  nearbyStops: GTFSStop[];

  /** The search radius used (meters) */
  searchRadiusMeters: number;

  /** The user's location used as the query origin */
  userLocation: Coordinate;

  /** ISO 8601 timestamp of the query */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Route Result Models
// ---------------------------------------------------------------------------

/** Lightweight representation of a GeoJSON FeatureCollection to maintain zero-dependency core */
export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: string;
      coordinates: any;
    };
    properties?: any;
  }>;
}

/**
 * A complete route search result containing one or more legs.
 * Returned by the routing engine (Go Dijkstra service).
 */
export interface RouteResult {
  /** Ordered list of legs (transit + walking) */
  legs: RouteLeg[];

  /** Total estimated travel time in seconds */
  totalTimeSeconds: number;

  /** Total fare in Philippine Pesos */
  totalFarePHP: number;

  /** Number of vehicle transfers */
  transfers: number;

  /** Worst crowding score across all transit legs (0.0–1.0) */
  crowdingWorstLeg: number;

  /** GeoJSON FeatureCollection for map rendering */
  geoJson: GeoJSONFeatureCollection;
}

/**
 * A single leg of a route (either riding transit or walking).
 */
export interface RouteLeg {
  /** Whether this is a transit ride or a walking segment */
  type: LegType;

  /** Route ID (only for transit legs) */
  routeId?: string;

  /** Route short name for display (only for transit legs) */
  routeShortName?: string;

  /** Full route details (only for transit legs) */
  route?: GTFSRoute;

  /** Boarding stop / walk origin */
  fromStop: GTFSStop;

  /** Alighting stop / walk destination */
  toStop: GTFSStop;

  /** Duration of this leg in seconds */
  durationSeconds: number;

  /** Distance of this leg in meters */
  distanceMeters: number;

  /** Fare for this leg in PHP (only for transit legs) */
  farePHP?: number;

  /** Step-by-step navigation instructions with cultural cues */
  instructions: NavigationInstruction[];
}

/**
 * A single navigation instruction with Cebuano cultural context.
 * See SKILLS.md §10.2 for localization requirements.
 */
export interface NavigationInstruction {
  /** Step number (1-indexed) */
  step: number;

  /** Action type for this step */
  action: NavigationAction;

  /** Human-readable description in the user's language */
  description: string;

  /** Cebuano phrase for this action, e.g., "Lugar lang" */
  cebuanoPhrase?: string;

  /**
   * Cultural cue for tourists, e.g.:
   * - "Signal to stop: Wave palm down"
   * - "Disembark phrase: Lugar lang"
   */
  culturalCue?: string;

  /** Nearby landmark for orientation */
  landmark?: string;
}

// ---------------------------------------------------------------------------
// Route Search Preferences
// ---------------------------------------------------------------------------

/**
 * User preferences for route search.
 * Passed to the routing engine to customize results.
 */
export interface RoutePrefs {
  /** What to optimize for */
  minimize: RouteMinimize;

  /** Passenger type for fare calculation */
  passengerType: PassengerType;

  /** Maximum walking distance in meters (default: 500) */
  maxWalkingMeters: number;

  /** Only show wheelchair-accessible routes */
  accessibilityMode: boolean;

  /** Route IDs to exclude from results */
  avoidRoutes: string[];
}

// ---------------------------------------------------------------------------
// AI Context Models (Anti-Hallucination Protocol)
// ---------------------------------------------------------------------------

/**
 * Input for the AI assistant.
 * The `gtfsContext` field enforces the Contextual Fence:
 * the AI only sees verified GTFS results, never raw user queries.
 */
export interface AIQueryInput {
  /** User's natural language query */
  query: string;

  /** Detected language */
  language: "en" | "ceb" | "fil";

  /** Pre-fetched, verified GTFS route results — the AI's ONLY data source */
  gtfsContext: RouteResult[];

  /** User's current location (optional) */
  userLocation?: Coordinate;
}

/**
 * Response from the AI assistant.
 */
export interface AIQueryResponse {
  /** Natural language answer in the detected language */
  answer: string;

  /** Structured route results for UI rendering */
  routes: RouteResult[];

  /** Confidence score (0.0–1.0) */
  confidence: number;

  /**
   * Whether the answer was constrained to the provided context.
   * If `false`, the AI attempted to go outside the fence and should be rejected.
   */
  contextFenced: boolean;
}
