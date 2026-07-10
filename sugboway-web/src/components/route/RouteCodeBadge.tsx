"use client";

import React from "react";
import type { GTFSRoute } from "@/domain";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RouteCodeBadgeProps {
  /** Route short name to display, e.g., "13C", "04L", "MyBus" */
  code: string;

  /**
   * Visual variant:
   * - `default`: white text on cebu-blue (primary)
   * - `inactive`: grey outline
   * - `alert`: amber background for warnings
   */
  variant?: "default" | "inactive" | "alert";

  /** Optional size override */
  size?: "sm" | "md" | "lg";

  /** Full route data for tooltip (optional) */
  route?: GTFSRoute;
}

// ---------------------------------------------------------------------------
// Size Mappings
// ---------------------------------------------------------------------------

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-sm",
  md: "px-2.5 py-0.5 text-base",
  lg: "px-3.5 py-1 text-xl",
} as const;

// ---------------------------------------------------------------------------
// Variant Mappings
// ---------------------------------------------------------------------------

const VARIANT_CLASSES = {
  default: "sw-board",
  inactive: "border border-outline text-on-surface-variant font-signboard font-bold uppercase tracking-[0.045em] rounded",
  alert: "bg-alert-amber text-white font-signboard font-bold uppercase tracking-[0.045em] rounded shadow-[var(--sw-plate-edge)]",
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * RouteCodeBadge — High-contrast pill badge for Cebu transit route codes.
 *
 * Features:
 * - Bold monospace typography for crisp readability at small sizes
 * - Three visual variants: default (cebu-blue), inactive (grey outline), alert (amber)
 * - Three sizes: sm, md, lg
 * - Accessible: includes `aria-label` with full route name when route data is provided
 *
 * @example
 * ```tsx
 * <RouteCodeBadge code="13C" />
 * <RouteCodeBadge code="04L" variant="inactive" />
 * <RouteCodeBadge code="MyBus" variant="alert" size="lg" />
 * ```
 */
export default function RouteCodeBadge({
  code,
  variant = "default",
  size = "md",
  route,
}: RouteCodeBadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center justify-center leading-none
        whitespace-nowrap select-none
        transition-[filter] duration-150
        ${VARIANT_CLASSES[variant]}
        ${SIZE_CLASSES[size]}
      `}
      aria-label={
        route
          ? `Route ${code}: ${route.routeLongName}`
          : `Route ${code}`
      }
      role="status"
    >
      {code}
    </span>
  );
}
