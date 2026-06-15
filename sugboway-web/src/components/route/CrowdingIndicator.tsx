"use client";

import React from "react";
import { classifyCrowding, getCrowdingIcon } from "@/domain";
import type { CrowdingData } from "@/domain";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CrowdingIndicatorProps {
  /** Crowding score from 0.0 (empty) to 1.0 (packed) */
  score: number;

  /** Show the text label alongside the bar */
  showLabel?: boolean;

  /** Show the icon */
  showIcon?: boolean;

  /** Compact mode: thinner bar, no label */
  compact?: boolean;

  /** Optional class name for the container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * CrowdingIndicator — Animated horizontal bar showing real-time crowding level.
 *
 * Based on the BPR (Bureau of Public Roads) hybrid cost function output.
 * See SKILLS.md §5.1 for the mathematical model.
 *
 * Features:
 * - Width proportional to crowdingScore (0–100%)
 * - Color transitions: green → yellow → orange → red
 * - Animated fill with CSS transitions
 * - Pulsing animation at "packed" level (score > 0.8)
 * - Material icon indicating passenger density
 * - Accessible: aria-valuenow for screen readers
 *
 * @example
 * ```tsx
 * <CrowdingIndicator score={0.25} />  // Green, comfortable
 * <CrowdingIndicator score={0.65} />  // Orange, crowded
 * <CrowdingIndicator score={0.92} showLabel />  // Red, packed, pulsing
 * ```
 */
export default function CrowdingIndicator({
  score,
  showLabel = false,
  showIcon = true,
  compact = false,
  className = "",
}: CrowdingIndicatorProps) {
  const data: CrowdingData = classifyCrowding(score);
  const widthPercent = Math.round(data.score * 100);
  const iconName = getCrowdingIcon(data.level);

  // Bar height varies by mode
  const barHeight = compact ? "h-2" : "h-3.5";

  // Dynamic fill color based on crowding level
  const fillColorMap: Record<string, string> = {
    comfortable: "bg-crowding-low",
    moderate: "bg-crowding-mid",
    crowded: "bg-crowding-high",
    packed: "bg-crowding-full",
  };
  const fillColor = fillColorMap[data.level] || "bg-crowding-low";

  // Glow effect for high/packed levels
  const glowMap: Record<string, string> = {
    comfortable: "",
    moderate: "",
    crowded: "shadow-[0_0_6px_rgba(249,115,22,0.4)]",
    packed: "shadow-[0_0_8px_rgba(186,26,26,0.5)]",
  };
  const glow = glowMap[data.level] || "";

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      role="meter"
      aria-valuenow={widthPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Crowding level: ${data.label} (${widthPercent}%)`}
    >
      {/* Icon */}
      {showIcon && !compact && (
        <span
          className={`material-symbols-outlined text-base ${
            data.level === "packed"
              ? "text-crowding-full"
              : data.level === "crowded"
              ? "text-crowding-high"
              : data.level === "moderate"
              ? "text-crowding-mid"
              : "text-crowding-low"
          }`}
          aria-hidden="true"
        >
          {iconName}
        </span>
      )}

      {/* Bar Container */}
      <div className="flex-1 flex flex-col gap-0.5">
        {/* Label Row */}
        {showLabel && !compact && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">
              Crowd Meter
            </span>
            <span
              className={`text-xs font-bold ${
                data.level === "packed"
                  ? "text-crowding-full"
                  : data.level === "crowded"
                  ? "text-crowding-high"
                  : data.level === "moderate"
                  ? "text-crowding-mid"
                  : "text-crowding-low"
              }`}
            >
              {data.label}
            </span>
          </div>
        )}

        {/* Bar Track */}
        <div
          className={`w-full bg-surface-container-highest rounded-full overflow-hidden ${barHeight}`}
        >
          {/* Animated Fill */}
          <div
            className={`
              ${barHeight} rounded-full
              ${fillColor} ${glow}
              animate-crowding-fill
              transition-all duration-500 ease-out
              ${data.shouldPulse ? "animate-crowding-pulse" : ""}
            `}
            style={{ width: `${widthPercent}%` }}
          />
        </div>
      </div>

      {/* Percentage (compact inline) */}
      {compact && (
        <span className="text-xs font-bold text-on-surface-variant tabular-nums min-w-[2rem] text-right">
          {widthPercent}%
        </span>
      )}
    </div>
  );
}
