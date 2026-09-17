import { Text, View } from "react-native";

/**
 * Ports sugboway-web's RouteCodeBadge `default` variant only — the mobile
 * result cards never need the `inactive`/`alert` variants the web version
 * carries for its route-picker and congestion screens. High-contrast white
 * monospace on the enamel plate fill, per AGENTS.md's two-accent rule.
 */
export default function RouteCodeBadge({ code }: { code: string }) {
  return (
    <View className="bg-enamel rounded px-2 py-0.5" style={{ elevation: 1 }}>
      <Text className="font-mono text-white text-sm">{code}</Text>
    </View>
  );
}
