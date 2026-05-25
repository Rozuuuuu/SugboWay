"use client";

import React from "react";
import { calculateFare, formatPHP, getDiscountRate } from "@/domain";
import type { PassengerType } from "@/domain";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FareBadgeProps {
  /** Distance in kilometers for fare calculation */
  distanceKm: number;

  /** Number of transfers (0 = direct) */
  transfers?: number;

  /** Current passenger type selection */
  passengerType: PassengerType;

  /** Whether to show the discount toggle UI */
  showToggle?: boolean;

  /** Callback when passenger type is toggled */
  onPassengerTypeChange?: (type: PassengerType) => void;

  /** Optional class name */
  className?: string;
}

// ---------------------------------------------------------------------------
// Discount label mapping
// ---------------------------------------------------------------------------

const DISCOUNT_LABELS: Record<PassengerType, string> = {
  regular: "Regular Fare",
  student: "Student Discount (20%)",
  senior: "Senior Discount (20%)",
  pwd: "PWD Discount (20%)",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * FareBadge — Deterministic fare display with discount state management.
 *
 * Uses the `calculateFare()` domain function — no hardcoded values.
 * All fare logic follows LTFRB Order 2023 (SKILLS.md §3.3):
 *   - ₱13.00 base fare for first 4km
 *   - ₱1.80 per km surcharge after 4km
 *   - 20% discount for Student/PWD/Senior
 *
 * Features:
 * - Shows fare amount in Philippine Peso (₱)
 * - Struck-through original price when discount is active
 * - Color-coded: safe-green for regular, cebu-blue for discounted
 * - Optional toggle for switching passenger types
 * - Fully deterministic: same inputs always produce same output
 *
 * @example
 * ```tsx
 * <FareBadge distanceKm={3.2} passengerType="regular" />
 * <FareBadge distanceKm={6.0} passengerType="student" showToggle />
 * ```
 */
export default function FareBadge({
  distanceKm,
  transfers = 0,
  passengerType,
  showToggle = false,
  onPassengerTypeChange,
  className = "",
}: FareBadgeProps) {
  // Calculate fare using the domain function
  const fare = calculateFare(distanceKm, passengerType, transfers);
  const regularFare = calculateFare(distanceKm, "regular", transfers);
  const hasDiscount = fare.discountRate > 0;

  // Cycle through passenger types on toggle
  const cycleTypes: PassengerType[] = ["regular", "student", "senior", "pwd"];

  const handleToggle = () => {
    if (!onPassengerTypeChange) return;
    const currentIdx = cycleTypes.indexOf(passengerType);
    const nextIdx = (currentIdx + 1) % cycleTypes.length;
    onPassengerTypeChange(cycleTypes[nextIdx]);
  };

  return (
    <div className={`flex flex-col items-end gap-1 ${className}`}>
      {/* Fare Amount */}
      <div className="flex items-baseline gap-1.5">
        {/* Struck-through original price (when discounted) */}
        {hasDiscount && (
          <span className="text-xs line-through text-outline fare-transition">
            {formatPHP(regularFare.totalFare)}
          </span>
        )}

        {/* Active fare */}
        <span
          className={`
            text-xl font-semibold tabular-nums fare-transition
            ${hasDiscount ? "text-cebu-blue" : "text-safe-green"}
          `}
        >
          {formatPHP(fare.totalFare)}
        </span>
      </div>

      {/* Discount Label */}
      <span className="text-xs text-on-surface-variant italic">
        {DISCOUNT_LABELS[passengerType]}
      </span>

      {/* Optional Toggle */}
      {showToggle && onPassengerTypeChange && (
        <button
          onClick={handleToggle}
          className={`
            flex items-center gap-1.5 mt-1
            px-3 py-1 rounded-full text-xs font-medium
            transition-all duration-200
            ${
              hasDiscount
                ? "bg-cebu-blue/10 text-cebu-blue border border-cebu-blue/20"
                : "bg-surface-container-high text-on-surface-variant border border-outline-variant"
            }
            hover:shadow-sm active:scale-95
          `}
          aria-label={`Switch passenger type. Current: ${passengerType}`}
        >
          <span
            className="material-symbols-outlined text-sm"
            aria-hidden="true"
          >
            {hasDiscount ? "verified" : "swap_horiz"}
          </span>
          {hasDiscount ? "Discount Applied" : "Apply Discount"}
        </button>
      )}

      {/* Multi-leg breakdown (when there are transfers) */}
      {transfers > 0 && (
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-on-surface-variant">
            {fare.perLeg.length} legs × {formatPHP(fare.discountedLegFare)}
          </span>
        </div>
      )}
    </div>
  );
}
