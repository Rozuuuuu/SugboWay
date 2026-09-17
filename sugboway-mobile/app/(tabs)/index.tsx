import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PlaceDropdown from "../../components/route/PlaceDropdown";
import PrimaryButton from "../../components/ui/PrimaryButton";
import type { Place } from "../../data/places";
import type { PassengerType, RouteResult } from "../../domain";
import { searchRoutes } from "../../lib/api";

export default function RoutesScreen() {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  // Held for the coming fare/accessibility UI (Task 9+) — searchRoutes already
  // takes both, so the plumbing is wired now even though nothing edits them yet.
  const [passengerType] = useState<PassengerType>("regular");
  const [accessible] = useState(false);
  const [results, setResults] = useState<RouteResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSearch = origin !== null && destination !== null && !loading;

  const handleFindRoutes = async () => {
    if (!origin || !destination) return;
    setLoading(true);
    setError(null);
    setResults(null);
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
      <ScrollView contentContainerClassName="p-4 gap-4" keyboardShouldPersistTaps="handled">
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

        {results !== null && !loading && (
          <Text className="text-on-surface font-sans" testID="route-result-count">
            {results.length} route{results.length !== 1 ? "s" : ""} found
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
