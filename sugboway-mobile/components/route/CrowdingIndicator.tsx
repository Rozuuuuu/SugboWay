import { Text, View } from "react-native";
import { classifyCrowding } from "../../domain/crowding";
import { useTheme } from "../ThemeProvider";
import { TOKENS } from "../../theme/tokens";
import type { CrowdingLevel } from "../../domain";

/**
 * Ports sugboway-web's CrowdingIndicator, collapsed to a single dot + label
 * (the web version's animated fill bar has no RN transition equivalent worth
 * faking). Green/amber/clay/red are reserved for crowding only — see
 * AGENTS.md — and their hex values SHIFT between themes (`safe-green`
 * `#1f7a43` light -> `#4fc27a` dark), so the dot's `backgroundColor` must
 * read `TOKENS[resolved]` rather than a Tailwind class: the dot is a style
 * prop, which NativeWind classes cannot reach.
 */
export default function CrowdingIndicator({ score }: { score: number }) {
  const { level } = classifyCrowding(score);
  const { resolved } = useTheme();
  const t = TOKENS[resolved];

  const color: Record<CrowdingLevel, string> = {
    comfortable: t.safeGreen,
    moderate: t.alertAmber,
    crowded: t.clay,
    packed: t.error,
  };

  return (
    <View className="flex-row items-center gap-1.5">
      <View
        testID="crowding-dot"
        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color[level] }}
      />
      <Text className="text-xs font-sans capitalize text-on-surface-variant">{level}</Text>
    </View>
  );
}
