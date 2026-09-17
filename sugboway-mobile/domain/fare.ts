/**
 * SugboWay Fare Calculator
 * ========================
 * Deterministic fare computation per LTFRB Order 2023.
 * See SKILLS.md §3.3 for the full specification.
 *
 * This module is framework-agnostic and has zero dependencies.
 */

import type { PassengerType } from "./types";

// ---------------------------------------------------------------------------
// Constants (LTFRB Order 2023)
// ---------------------------------------------------------------------------

export const FARE_CONSTANTS = {
  /** Base fare in Philippine Pesos */
  BASE_FARE_PHP: 13.0,

  /** Additional charge per kilometer beyond the free distance */
  SURCHARGE_PER_KM: 1.8,

  /** Distance covered by the base fare (km) */
  FREE_DISTANCE_KM: 4.0,

  /** Discount rate for Student / PWD / Senior (20%) */
  DISCOUNT_RATE: 0.2,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FareBreakdown {
  /** Raw base fare before surcharge */
  baseFare: number;

  /** Distance-based surcharge (₱0 if within free distance) */
  distanceSurcharge: number;

  /** Applied discount rate (0.0 for regular, 0.20 for discounted) */
  discountRate: number;

  /** Fare per leg after discount */
  discountedLegFare: number;

  /** Total fare across all legs */
  totalFare: number;

  /** Breakdown of fare per individual leg */
  perLeg: number[];

  /** Passenger type used for this calculation */
  passengerType: PassengerType;
}

// ---------------------------------------------------------------------------
// Discount Logic
// ---------------------------------------------------------------------------

/**
 * Returns the discount rate for a given passenger type.
 * Regular passengers pay full fare; Student/PWD/Senior get 20% off.
 */
export function getDiscountRate(passengerType: PassengerType): number {
  switch (passengerType) {
    case "student":
    case "senior":
    case "pwd":
      return FARE_CONSTANTS.DISCOUNT_RATE;
    case "regular":
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Core Calculator
// ---------------------------------------------------------------------------

/**
 * Calculate the fare for a route with a given distance and passenger type.
 *
 * Logic:
 * 1. Start with base fare (₱13.00)
 * 2. If distance > 4km, add ₱1.80 per additional km
 * 3. Apply 20% discount for Student/PWD/Senior
 * 4. Multiply by (transfers + 1) since each boarded vehicle charges a fare
 *
 * @param distanceKm - Total trip distance in kilometers
 * @param passengerType - Passenger category for discount
 * @param transfers - Number of vehicle transfers (0 = direct route)
 * @returns Complete fare breakdown
 *
 * @example
 * ```ts
 * // Direct route, 6km, student
 * const fare = calculateFare(6.0, 'student', 0);
 * // baseFare: 13.00
 * // surcharge: (6.0 - 4.0) * 1.80 = 3.60
 * // legFare: 16.60
 * // discounted: 16.60 * 0.80 = 13.28
 * // total: 13.28 (1 leg)
 * ```
 */
export function calculateFare(
  distanceKm: number,
  passengerType: PassengerType,
  transfers: number
): FareBreakdown {
  const { BASE_FARE_PHP, SURCHARGE_PER_KM, FREE_DISTANCE_KM } = FARE_CONSTANTS;

  // Step 1: Base fare
  let baseFare = BASE_FARE_PHP;

  // Step 2: Distance surcharge (kicks in after FREE_DISTANCE_KM)
  let distanceSurcharge = 0;
  if (distanceKm > FREE_DISTANCE_KM) {
    distanceSurcharge = (distanceKm - FREE_DISTANCE_KM) * SURCHARGE_PER_KM;
  }

  // Raw leg fare before discount
  const rawLegFare = baseFare + distanceSurcharge;

  // Step 3: Apply discount
  const discountRate = getDiscountRate(passengerType);
  const discountedLegFare = roundPHP(rawLegFare * (1 - discountRate));

  // Step 4: Total = fare per leg × number of vehicles boarded
  const legsCount = transfers + 1;
  const perLeg = Array(legsCount).fill(discountedLegFare);
  const totalFare = roundPHP(discountedLegFare * legsCount);

  return {
    baseFare,
    distanceSurcharge: roundPHP(distanceSurcharge),
    discountRate,
    discountedLegFare,
    totalFare,
    perLeg,
    passengerType,
  };
}

// ---------------------------------------------------------------------------
// Formatting Utilities
// ---------------------------------------------------------------------------

/**
 * Round to 2 decimal places (Philippine Peso precision).
 */
function roundPHP(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Format a PHP amount for display: "₱13.00"
 */
export function formatPHP(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}
