import { Pressable, Text, View } from "react-native";
import { calculateFare, formatPHP } from "../../domain/fare";
import type { PassengerType, RouteResult } from "../../domain";
import Card from "../ui/Card";
import Icon from "../ui/Icon";
import RouteCodeBadge from "./RouteCodeBadge";
import FareBadge from "./FareBadge";
import CrowdingIndicator from "./CrowdingIndicator";

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""}`;
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) return `${hrs} hr${hrs !== 1 ? "s" : ""}`;
  return `${hrs} hr${hrs !== 1 ? "s" : ""} ${remainingMins} min${remainingMins !== 1 ? "s" : ""}`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * A GTFSRoute's `routeType` field is typed required, but live API payloads
 * omit it (see AGENTS.md / task-9 correction 3). `route` itself is optional
 * on a leg, so this chain is already `RouteType | undefined` through the
 * `?.` — every branch below has an explicit fallback rather than trusting
 * the type's promise that the field exists.
 */
function vehicleLabel(routeType: string | undefined, isModernized: boolean | undefined): string {
  if (isModernized) return "Modern E-Jeep";
  if (routeType === "mybus") return "MyBus";
  if (routeType === "ceres") return "Ceres Bus";
  if (routeType === "bus") return "Bus";
  return "Jeepney";
}

export default function RouteCard({
  route,
  passengerType,
  selected,
  onPress,
}: {
  route: RouteResult;
  passengerType: PassengerType;
  selected: boolean;
  onPress: () => void;
}) {
  const transitLegs = route.legs.filter((leg) => leg.type === "transit");
  const walkingLegs = route.legs.filter((leg) => leg.type === "walking");
  const totalWalkingMeters = walkingLegs.reduce((acc, leg) => acc + leg.distanceMeters, 0);
  const totalDistanceKm = route.legs.reduce((acc, leg) => acc + leg.distanceMeters / 1000, 0);

  // The fare API takes a transfer COUNT as its third argument (not a route
  // type string), and FareBreakdown's total field is `totalFare` — there is
  // no `totalPHP` (task-9 correction 2).
  const fare = calculateFare(totalDistanceKm, passengerType, route.transfers);

  const primaryTransitLeg = transitLegs[0];
  const label = vehicleLabel(primaryTransitLeg?.route?.routeType, primaryTransitLeg?.route?.isModernized);

  return (
    <Pressable onPress={onPress} testID="route-card" accessibilityRole="button">
      <Card className={selected ? "border-2 border-cebu-blue" : ""}>
        <View className="p-4 gap-3">
          {/* Route codes + fare */}
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 flex-row flex-wrap items-center gap-1">
              {transitLegs.length > 0 ? (
                transitLegs.map((leg, idx) => (
                  <View key={`${leg.routeId ?? "leg"}-${idx}`} className="flex-row items-center gap-1">
                    {idx > 0 && <Icon name="chevron-right" size={14} />}
                    <RouteCodeBadge code={leg.routeShortName ?? "JP"} />
                  </View>
                ))
              ) : (
                <View className="flex-row items-center gap-1.5">
                  <Icon name="directions-walk" size={20} />
                  <Text className="text-on-surface-variant font-sans text-sm">Walking route</Text>
                </View>
              )}
            </View>
            <View className="items-end gap-0.5">
              <FareBadge farePHP={fare.totalFare} />
              {route.transfers > 0 && (
                <Text className="text-[11px] text-on-surface-variant font-sans">
                  {fare.perLeg.length} legs × {formatPHP(fare.discountedLegFare)}
                </Text>
              )}
            </View>
          </View>

          {transitLegs.length > 0 && (
            <View className="flex-row items-center gap-1.5">
              <Icon name={primaryTransitLeg?.route?.isModernized ? "electric-car" : "directions-bus"} size={16} />
              <Text className="text-xs text-on-surface-variant font-sans">{label}</Text>
            </View>
          )}

          {/* Duration + transfers + walking distance */}
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <Text className="text-on-surface font-display text-lg">
              {formatDuration(route.totalTimeSeconds)}
            </Text>
            <View className="flex-row items-center gap-1">
              <Icon name={route.transfers > 0 ? "alt-route" : "trending-flat"} size={16} />
              <Text className="text-xs text-on-surface-variant font-sans">
                {route.transfers === 0
                  ? "Direct route"
                  : `${route.transfers} transfer${route.transfers > 1 ? "s" : ""}`}
              </Text>
            </View>
            {totalWalkingMeters > 0 && (
              <View className="flex-row items-center gap-1">
                <Icon name="directions-walk" size={14} />
                <Text className="text-xs text-on-surface-variant font-sans">
                  {formatDistance(totalWalkingMeters)} walk
                </Text>
              </View>
            )}
          </View>

          {/* Crowding */}
          {transitLegs.length > 0 && (
            <View className="border-t border-outline-variant pt-2">
              <CrowdingIndicator score={route.crowdingWorstLeg} />
            </View>
          )}

          {/* Per-leg rows */}
          <View className="gap-2 border-t border-outline-variant pt-2">
            {route.legs.map((leg, idx) => (
              <View key={idx} className="flex-row items-center justify-between gap-2">
                <View className="flex-1 min-w-0 flex-row items-center gap-2">
                  <Icon name={leg.type === "transit" ? "directions-bus" : "directions-walk"} size={16} />
                  <Text className="flex-1 text-xs text-on-surface font-sans" numberOfLines={1}>
                    {leg.fromStop.stopName} → {leg.toStop.stopName}
                  </Text>
                </View>
                <Text className="text-xs text-on-surface-variant font-sans tabular-nums">
                  {formatDuration(leg.durationSeconds)} · {formatDistance(leg.distanceMeters)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
