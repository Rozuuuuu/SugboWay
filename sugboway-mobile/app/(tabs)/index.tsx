import { useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import RouteMap from "../../components/map/RouteMap";
import PlaceDropdown from "../../components/route/PlaceDropdown";
import RouteCard from "../../components/route/RouteCard";
import PrimaryButton from "../../components/ui/PrimaryButton";
import { useTheme } from "../../components/ThemeProvider";
import type { Place } from "../../data/places";
import type { PassengerType, RouteResult } from "../../domain";
import { searchRoutes } from "../../lib/api";

const CARTO_STYLE_URL = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
} as const;

export default function RoutesScreen() {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  // Held for the coming accessibility UI — searchRoutes already takes both,
  // so the plumbing is wired now even though nothing edits `accessible` yet.
  const [passengerType] = useState<PassengerType>("regular");
  const [accessible] = useState(false);
  const [results, setResults] = useState<RouteResult[] | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { resolved } = useTheme();

  const canSearch = origin !== null && destination !== null && !loading;

  const handleFindRoutes = async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSelectedRoute(null);
    try {
      const found = await searchRoutes(
        { lat: origin.lat, lon: origin.lon },
        { lat: destination.lat, lon: destination.lon },
        passengerType,
        accessible
      );
      setResults(found);
    } catch {
      // The routing DB autosuspends: a cold request measures ~32s before it
      // settles to ~0.6s warm. This is a genuine failure, not a timeout —
      // fetch() here carries no client-side timeout below that threshold.
      setError("Couldn't reach the routing service. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* A single FlatList (form as its header, route cards as its data)
          rather than a ScrollView wrapping a FlatList — RN warns loudly
          about nesting a VirtualizedList inside another scroll container. */}
      <FlatList
        data={results ?? []}
        keyExtractor={(_, idx) => String(idx)}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="p-4 gap-3"
        testID="route-result-list"
        ListHeaderComponent={
          <View className="gap-4 mb-1">
            <Text className="text-on-surface text-2xl font-display">Routes</Text>

            <PlaceDropdown label="From" value={origin} onSelect={setOrigin} />
            <PlaceDropdown label="To" value={destination} onSelect={setDestination} />

            <PrimaryButton
              label={loading ? "Finding routes…" : "Find routes"}
              onPress={handleFindRoutes}
              disabled={!canSearch}
            />

            {loading && (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator />
                <Text className="text-on-surface-variant text-xs font-sans flex-1">
                  This can take up to 30 seconds on the first search of the day while the
                  routing service wakes up.
                </Text>
              </View>
            )}

            {error && <Text className="text-error font-sans">{error}</Text>}

            {results !== null && !loading && results.length === 0 && (
              <Text className="text-on-surface-variant font-sans" testID="route-empty">
                No routes found for that trip.
              </Text>
            )}

            {results !== null && results.length > 0 && (
              <View className="h-64 rounded-lg overflow-hidden border border-outline-variant">
                <RouteMap route={selectedRoute} styleUrl={CARTO_STYLE_URL[resolved]} />
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <RouteCard
            route={item}
            passengerType={passengerType}
            selected={selectedRoute === item}
            onPress={() => setSelectedRoute(item)}
          />
        )}
      />
    </SafeAreaView>
  );
}
