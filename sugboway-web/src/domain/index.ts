/**
 * SugboWay Domain — Barrel Export
 * Re-exports all domain types, functions, and ports for convenient imports.
 */

// Types
export type {
  Coordinate,
  RouteType,
  PassengerType,
  RouteMinimize,
  NavigationAction,
  LegType,
  CrowdingLevel,
  GTFSRoute,
  GTFSStop,
  SpatialQueryResponse,
  RouteResult,
  RouteLeg,
  NavigationInstruction,
  RoutePrefs,
  AIQueryInput,
  AIQueryResponse,
} from "./types";

// Fare
export {
  FARE_CONSTANTS,
  calculateFare,
  getDiscountRate,
  formatPHP,
} from "./fare";
export type { FareBreakdown } from "./fare";

// Crowding
export {
  BPR_DEFAULTS,
  CROWDING_THRESHOLDS,
  bprTravelTime,
  volumeToScore,
  classifyCrowding,
  getCrowdingIcon,
} from "./crowding";
export type { CrowdingData } from "./crowding";

// Ports
export type {
  SpatialQueryPort,
  AIAssistantPort,
  CrowdingDataPort,
  OfflineStoragePort,
} from "./ports";
