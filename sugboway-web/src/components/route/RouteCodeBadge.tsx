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
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-sm",
  lg: "px-4 py-1.5 text-base",
} as const;

// ---------------------------------------------------------------------------
// Variant Mappings
// ---------------------------------------------------------------------------

const VARIANT_CLASSES = {
  default: "sw-fill-sea shadow-[var(--sw-glow-blue)]",
  inactive: "bg-transparent text-outline border border-outline",
  alert: "bg-alert-amber text-on-tertiary-fixed",
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
        inline-flex items-center justify-center
        font-mono font-bold tracking-wider uppercase
        rounded-lg whitespace-nowrap select-none
        transition-all duration-150
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
