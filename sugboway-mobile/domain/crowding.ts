/**
 * SugboWay Crowding Model
 * =======================
 * Bureau of Public Roads (BPR) function implementation and crowding classification.
 * See SKILLS.md §5.1 for the BPR specification and Cebu calibration values.
 *
 * This module is framework-agnostic and has zero dependencies.
 */

import type { CrowdingLevel } from "./types";

// ---------------------------------------------------------------------------
// BPR Constants (Cebu Calibration)
// ---------------------------------------------------------------------------

export const BPR_DEFAULTS = {
  /** Standard urban BPR calibration constant */
  ALPHA: 0.15,

  /** Standard urban BPR calibration exponent */
  BETA: 4.0,

  /** Off-peak alpha (lighter penalty) */
  ALPHA_OFF_PEAK: 0.1,

  /** Off-peak beta */
  BETA_OFF_PEAK: 3.0,
} as const;

// ---------------------------------------------------------------------------
// Crowding Thresholds (SKILLS.md §5.2)
// ---------------------------------------------------------------------------

export const CROWDING_THRESHOLDS = {
  COMFORTABLE_MAX: 0.3,
  MODERATE_MAX: 0.6,
  CROWDED_MAX: 0.8,
  // Above 0.8 = packed
} as const;

// ---------------------------------------------------------------------------
// Crowding Data Model
// ---------------------------------------------------------------------------

export interface CrowdingData {
  /** Raw score from 0.0 (empty) to 1.0 (maximum capacity) */
  score: number;

  /** Classified level */
  level: CrowdingLevel;

  /** Human-readable label */
  label: string;

  /** Tailwind CSS color class for the indicator bar */
  colorClass: string;

  /** Hex color for direct styling */
  hexColor: string;

  /** CSS variable name for the crowding color */
  cssVar: string;

  /** Whether this level should trigger a pulsing animation */
  shouldPulse: boolean;

  /** BPR-derived travel time in seconds (if computed) */
  bprTravelTime?: number;
}

// ---------------------------------------------------------------------------
// BPR Function
// ---------------------------------------------------------------------------

/**
 * Bureau of Public Roads (BPR) travel time function.
 *
 * Models how travel time increases as road volume approaches capacity:
 *   t = t₀ × (1 + α × (V/C)^β)
 *
 * Where:
 *   t₀ = free-flow travel time (seconds)
 *   V  = current volume (vehicles/hour)
 *   C  = road capacity (vehicles/hour)
 *   α  = calibration constant (default 0.15)
 *   β  = calibration exponent (default 4.0)
 *
 * @param freeFlowTime - Travel time at zero traffic (seconds)
 * @param volume - Current vehicles per hour on segment
 * @param capacity - Maximum vehicles per hour the road can handle
 * @param alpha - BPR calibration constant (default: 0.15)
 * @param beta - BPR calibration exponent (default: 4.0)
 * @returns Congested travel time in seconds
 */
export function bprTravelTime(
  freeFlowTime: number,
  volume: number,
  capacity: number,
  alpha: number = BPR_DEFAULTS.ALPHA,
  beta: number = BPR_DEFAULTS.BETA
): number {
  if (capacity <= 0) return freeFlowTime;
  return freeFlowTime * (1 + alpha * Math.pow(volume / capacity, beta));
}

/**
 * Convert a volume/capacity ratio to a crowding score (0.0–1.0).
 * Uses a sigmoid-like mapping to compress BPR output into [0, 1].
 */
export function volumeToScore(volume: number, capacity: number): number {
  if (capacity <= 0) return 0;
  const ratio = volume / capacity;
  // Clamp to [0, 1] using a simple min
  return Math.min(ratio, 1.0);
}

// ---------------------------------------------------------------------------
// Crowding Classification
// ---------------------------------------------------------------------------

/**
 * Classify a crowding score (0.0–1.0) into a structured CrowdingData object.
 *
 * Score ranges (from SKILLS.md §5.2):
 *   0.0–0.3 = Comfortable (green)
 *   0.3–0.6 = Moderate (yellow)
 *   0.6–0.8 = Crowded (orange)
 *   0.8–1.0 = Packed (red) — suggest alternative
 */
export function classifyCrowding(score: number): CrowdingData {
  // Clamp score to valid range
  const clampedScore = Math.max(0, Math.min(1, score));

  if (clampedScore <= CROWDING_THRESHOLDS.COMFORTABLE_MAX) {
    return {
      score: clampedScore,
      level: "comfortable",
      label: "Comfortable",
      colorClass: "bg-safe-green",
      hexColor: "#2e7d32",
      cssVar: "--color-crowding-low",
      shouldPulse: false,
    };
  }

  if (clampedScore <= CROWDING_THRESHOLDS.MODERATE_MAX) {
    return {
      score: clampedScore,
      level: "moderate",
      label: "Moderate",
      colorClass: "bg-alert-amber",
      hexColor: "#ffbf00",
      cssVar: "--color-crowding-mid",
      shouldPulse: false,
    };
  }

  if (clampedScore <= CROWDING_THRESHOLDS.CROWDED_MAX) {
    return {
      score: clampedScore,
      level: "crowded",
      label: "Crowded",
      colorClass: "bg-tertiary",
      hexColor: "#722b00",
      cssVar: "--color-crowding-high",
      shouldPulse: false,
    };
  }

  return {
    score: clampedScore,
    level: "packed",
    label: "Very Crowded — suggest alternative",
    colorClass: "bg-error",
    hexColor: "#ba1a1a",
    cssVar: "--color-crowding-full",
    shouldPulse: true,
  };
}

/**
 * Get a compact icon representation for the crowding level.
 */
export function getCrowdingIcon(level: CrowdingLevel): string {
  switch (level) {
    case "comfortable":
      return "event_seat";       // Material icon: seat available
    case "moderate":
      return "airline_seat_recline_normal";
    case "crowded":
      return "group";
    case "packed":
      return "groups";           // Material icon: many people
  }
}
