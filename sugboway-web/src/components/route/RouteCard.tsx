"use client";

import React, { useState } from "react";
import type { RouteResult, PassengerType, RouteLeg } from "@/domain";
import RouteCodeBadge from "./RouteCodeBadge";
import CrowdingIndicator from "./CrowdingIndicator";
import FareBadge from "./FareBadge";

// Helper to format travel time into readable hours and minutes
function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""}`;
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) return `${hrs} hr${hrs !== 1 ? "s" : ""}`;
  return `${hrs} hr${hrs !== 1 ? "s" : ""} ${remainingMins} min${
    remainingMins !== 1 ? "s" : ""
  }`;
}

// Helper to format distance into readable meters or kilometers
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

interface RouteCardProps {
  /** The routing engine result representing a complete path */
  route: RouteResult;

  /** The passenger type currently selected */
  passengerType: PassengerType;

  /** Callback when the user clicks the card */
  onClick?: () => void;

  /** Whether the card is selected/highlighted */
  isSelected?: boolean;

  /** Callback when the user clicks Start Live Commute button */
  onStartNavigation?: () => void;

  /** Optional class name */
  className?: string;
}

/**
 * RouteCard Component
 * ====================
 * A premium React component representing a Cebu transit route.
 * It features:
 * - High-contrast route code badges (supporting multi-leg transfers)
 * - Animated crowding indicator powered by BPR (Bureau of Public Roads) congestion modeling
 * - Deterministic fare computation based on LTFRB 2023 Order
 * - Expandable step-by-step navigation panel showing Cebuano cultural cues and landmarks
 * - Polished Material Design 3-inspired micro-interactions and animations
 */
export default function RouteCard({
  route,
  passengerType,
  onClick,
  isSelected = false,
  onStartNavigation,
  className = "",
}: RouteCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [animatePress, setAnimatePress] = useState(false);

  // Extract all transit legs
  const transitLegs = route.legs.filter((leg) => leg.type === "transit");
  const walkingLegs = route.legs.filter((leg) => leg.type === "walking");

  const totalWalkingDistance = walkingLegs.reduce(
    (acc, leg) => acc + leg.distanceMeters,
    0
  );

  // Get primary display information from the first transit leg
  const primaryTransitLeg = transitLegs[0];
  const routeCode = primaryTransitLeg?.routeShortName || "Walk";
  const routeLongName =
    primaryTransitLeg?.route?.routeLongName ||
    "Walk to destination";
  const vehicleTypeLabel = primaryTransitLeg?.route?.isModernized
    ? "Modern E-Jeep"
    : primaryTransitLeg?.route?.routeType === "mybus"
    ? "MyBus"
    : primaryTransitLeg?.route?.routeType === "ceres"
    ? "Ceres Bus"
    : primaryTransitLeg?.route?.routeType === "bus"
    ? "Bus"
    : "Traditional Jeepney";

  const isAircon = primaryTransitLeg?.route?.hasAircon || false;

  const handleCardClick = (e: React.MouseEvent) => {
    // If clicking a button, toggle, or details panel, don't trigger main card selection
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a")) {
      return;
    }

    setAnimatePress(true);
    setTimeout(() => setAnimatePress(false), 150);

    if (onClick) {
      onClick();
    }
    setIsExpanded((prev) => !prev);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`
        relative overflow-hidden
        bg-surface-container-low border rounded-2xl p-4 sm:p-5
        transition-all duration-300 ease-out select-none cursor-pointer
        ${
          isSelected
            ? "border-cebu-blue ring-2 ring-cebu-blue/20 bg-surface-container-lowest shadow-md"
            : "border-outline-variant hover:border-outline hover:shadow-md hover:bg-surface-container-lowest"
        }
        ${animatePress ? "route-card-press" : ""}
        ${className}
      `}
    >
      {/* Decorative vertical selection accent */}
      {isSelected && (
        <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-gradient-to-b from-cebu-blue via-primary to-purple-500 rounded-l-2xl" />
      )}

      {/* Main Row Info: Stacked on mobile, side-by-side on sm+ */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {/* Mobile Top Row / Desktop Left Column */}
        <div className="flex sm:flex-col items-center justify-between sm:justify-start gap-3 w-full sm:w-auto sm:min-w-[4.5rem] pb-3 sm:pb-0 border-b border-outline-variant/30 sm:border-b-0">
          <div className="flex items-center gap-2">
            {transitLegs.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {transitLegs.map((leg, idx) => (
                  <React.Fragment key={leg.routeId || idx}>
                    {idx > 0 && (
                      <span
                        className="material-symbols-outlined text-xs text-outline self-center"
                        aria-hidden="true"
                      >
                        chevron_right
                      </span>
                    )}
                    <RouteCodeBadge
                      code={leg.routeShortName || "JP"}
                      route={leg.route}
                      size={transitLegs.length > 2 ? "sm" : "md"}
                    />
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <span className="material-symbols-outlined text-2xl text-outline-variant p-1.5 bg-surface-container-highest rounded-full">
                directions_walk
              </span>
            )}

            {/* Mobile-only duration */}
            <span className="sm:hidden text-base font-extrabold text-cebu-blue tabular-nums">
              {formatDuration(route.totalTimeSeconds)}
            </span>
          </div>

          {/* Desktop-only duration */}
          <span className="hidden sm:inline text-sm font-bold text-cebu-blue tabular-nums mt-1">
            {formatDuration(route.totalTimeSeconds)}
          </span>

          {/* Mobile-only Fare badge (aligned right) */}
          <div className="sm:hidden shrink-0">
            <FareBadge
              distanceKm={route.legs.reduce(
                (acc, leg) => acc + leg.distanceMeters / 1000,
                0
              )}
              transfers={route.transfers}
              passengerType={passengerType}
              showToggle={false}
            />
          </div>
        </div>

        {/* Content Body Column */}
        <div className="flex-1 min-w-0 w-full space-y-3">
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-body-md font-bold text-on-surface break-words leading-snug">
                {transitLegs.length > 0 ? routeLongName : "Walking Route"}
              </h3>

              {transitLegs.length > 0 && (
                <div className="flex items-center flex-wrap gap-2 mt-1.5">
                  <span className="text-xs sm:text-sm text-on-surface-variant flex items-center gap-1.5 mr-1">
                    <span
                      className="material-symbols-outlined text-[16px]"
                      aria-hidden="true"
                    >
                      {primaryTransitLeg.route?.isModernized
                        ? "electric_car"
                        : "directions_bus"}
                    </span>
                    {vehicleTypeLabel}
                  </span>

                  {primaryTransitLeg.route?.routeType === "mybus" ? (
                    <span className="bg-blue-500/10 text-blue-500 text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-blue-500/20 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-blue-500" />
                      Beep card • Scheduled stops • AC
                    </span>
                  ) : primaryTransitLeg.route?.isModernized ? (
                    <span className="bg-green-500/10 text-green-500 text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-green-500/20 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-green-500" />
                      Tap-to-pay • No conductor • AC
                    </span>
                  ) : (
                    <span className="bg-amber-500/10 text-amber-500 text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-amber-500/20 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-amber-500" />
                      Cash fare • Has conductor • No AC
                    </span>
                  )}
                </div>
              )}

              {/* Transfers indicator */}
              <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5 text-xs sm:text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] shrink-0">
                  {route.transfers > 0 ? "alt_route" : "trending_flat"}
                </span>
                <span>
                  {route.transfers === 0
                    ? "Direct Route"
                    : `${route.transfers} transfer${
                        route.transfers > 1 ? "s" : ""
                      }`}
                </span>
                {totalWalkingDistance > 0 && (
                  <>
                    <span className="text-outline-variant hidden xs:inline">•</span>
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">
                        directions_walk
                      </span>
                      {formatDistance(totalWalkingDistance)} walk
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Desktop-only Fare badge */}
            <div className="hidden sm:block shrink-0">
              <FareBadge
                distanceKm={route.legs.reduce(
                  (acc, leg) => acc + leg.distanceMeters / 1000,
                  0
                )}
                transfers={route.transfers}
                passengerType={passengerType}
                showToggle={false}
              />
            </div>
          </div>

          {/* Crowding Indicator Bar */}
          {transitLegs.length > 0 && (
            <div className="pt-2 border-t border-outline-variant/30">
              <CrowdingIndicator
                score={route.crowdingWorstLeg}
                showLabel={true}
                showIcon={true}
              />
            </div>
          )}
        </div>
      </div>

      {/* Expand/Collapse Toggle Button (Micro-Interaction) */}
      <div className="mt-3 flex justify-center border-t border-outline-variant/30 pt-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="min-h-[48px] px-4 py-2 flex items-center justify-center gap-1.5 text-sm font-bold text-on-surface-variant hover:text-cebu-blue transition-colors rounded-xl select-none"
          aria-expanded={isExpanded}
        >
          <span>{isExpanded ? "Hide Details" : "View Step-by-Step"}</span>
          <span
            className={`material-symbols-outlined text-[18px] transition-transform duration-300 ${
              isExpanded ? "rotate-180" : ""
            }`}
          >
            expand_more
          </span>
        </button>
      </div>

      {/* Expandable Navigation Details */}
      {isExpanded && (
        <div
          className="mt-4 pt-4 border-t border-outline-variant/60 space-y-4 animate-[fadeIn_0.3s_ease-out]"
          onClick={(e) => e.stopPropagation()} // Prevent clicking details from closing it
        >
          <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            Navigation Steps
          </h4>

          <div className="relative pl-6 space-y-4">
            {route.legs.map((leg, legIdx) => {
              const isLastLeg = legIdx === route.legs.length - 1;
              const isTransit = leg.type === "transit";

              return (
                <div
                  key={legIdx}
                  className={`
                    relative pb-1
                    ${!isLastLeg ? "step-line" : "step-line-last"}
                  `}
                  style={
                    {
                      "--line-color": isTransit
                        ? "var(--color-cebu-blue)"
                        : "var(--color-outline-variant)",
                    } as React.CSSProperties
                  }
                >
                  {/* Step Bullet Icon */}
                  <span
                    className={`
                      absolute -left-[27px] top-0.5
                      w-6 h-6 rounded-full flex items-center justify-center text-[14px]
                      ${
                        isTransit
                          ? "bg-cebu-blue text-white"
                          : "bg-surface-container-highest text-on-surface-variant border border-outline-variant"
                      }
                    `}
                  >
                    <span className="material-symbols-outlined text-sm font-bold">
                      {isTransit
                        ? isAircon
                          ? "electric_car"
                          : "directions_bus"
                        : "directions_walk"}
                    </span>
                  </span>

                  {/* Leg Header Info */}
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <h5 className="text-base font-bold text-on-surface">
                        {isTransit ? (
                          <span className="flex items-center gap-1.5 flex-wrap">
                            Board <RouteCodeBadge code={leg.routeShortName || "JP"} size="sm" />
                          </span>
                        ) : (
                          "Walk"
                        )}
                      </h5>
                      <p className="text-sm text-on-surface-variant mt-0.5 break-words">
                        From{" "}
                        <span className="font-semibold">{leg.fromStop.stopName}</span> to{" "}
                        <span className="font-semibold">{leg.toStop.stopName}</span>
                      </p>
                    </div>

                    <div className="text-left sm:text-right flex flex-row sm:flex-col items-baseline sm:items-end gap-1.5 sm:gap-0 shrink-0 mt-0.5 sm:mt-0">
                      <span className="text-sm font-extrabold sm:font-semibold text-on-surface tabular-nums">
                        {formatDuration(leg.durationSeconds)}
                      </span>
                      <span className="text-xs text-on-surface-variant tabular-nums">
                        ({formatDistance(leg.distanceMeters)})
                      </span>
                    </div>
                  </div>

                  {/* Step Instructions */}
                  {leg.instructions && leg.instructions.length > 0 && (
                    <ul className="mt-2 space-y-2.5 bg-surface-container/50 rounded-xl p-3 border border-outline-variant/10">
                      {leg.instructions.map((inst) => {
                        let actionIcon = "directions_run";
                        switch (inst.action) {
                          case "board":
                            actionIcon = "login";
                            break;
                          case "ride":
                            actionIcon = "directions_bus";
                            break;
                          case "alight":
                            actionIcon = "logout";
                            break;
                          case "transfer":
                            actionIcon = "alt_route";
                            break;
                          case "wait":
                            actionIcon = "schedule";
                            break;
                        }

                        return (
                          <li
                            key={inst.step}
                            className="flex gap-2 items-start text-sm text-on-surface-variant"
                          >
                            <span
                              className="material-symbols-outlined text-sm text-cebu-blue mt-0.5 shrink-0"
                              aria-hidden="true"
                            >
                              {actionIcon}
                            </span>
                            <div className="flex-1">
                              <span className="font-medium text-on-surface">
                                {inst.description}
                              </span>

                              {/* Landmark Hint */}
                              {inst.landmark && (
                                <span className="block text-xs text-on-surface-variant font-medium mt-0.5 flex items-center gap-0.5">
                                  <span className="material-symbols-outlined text-[14px] text-amber-500">
                                    pin_drop
                                  </span>
                                  Landmark: {inst.landmark}
                                </span>
                              )}

                              {/* Cebuano Cue & Cultural Guide Callouts (Polished Cards) */}
                              {(inst.cebuanoPhrase || inst.culturalCue) && (
                                <div className="mt-2.5 space-y-1.5">
                                  {inst.cebuanoPhrase && (
                                    <div className="text-xs text-primary dark:text-primary-fixed font-bold italic bg-primary/5 dark:bg-primary-container/20 border border-primary/10 dark:border-primary/20 rounded-lg px-3 py-1.5 inline-block max-w-full break-words">
                                      Cebuano Phrase: "{inst.cebuanoPhrase}"
                                    </div>
                                  )}
                                  {inst.culturalCue && (
                                    <div className="text-xs text-on-surface-variant bg-surface-container-high/65 border border-outline-variant/25 rounded-lg px-3 py-2 flex items-start gap-1.5 leading-relaxed">
                                      <span className="material-symbols-outlined text-[16px] text-cebu-blue shrink-0 mt-0.5" aria-hidden="true">
                                        info
                                      </span>
                                      <span>{inst.culturalCue}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {onStartNavigation && (
            <div className="pt-3 border-t border-outline-variant/30 mt-3 flex justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartNavigation();
                }}
                className="bg-safe-green hover:bg-emerald-700 text-white font-bold min-h-[48px] py-3 px-6 rounded-xl transition-all duration-200 active:scale-98 flex items-center justify-center gap-1.5 shadow-sm text-sm select-none"
              >
                <span className="material-symbols-outlined text-sm">navigation</span>
                <span>Start Live Commute</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
