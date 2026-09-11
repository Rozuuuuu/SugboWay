import { Pressable, Text } from "react-native";

/**
 * Ports `.sw-btn-primary` from sugboway-web's globals.css: a flat enamel
 * plate with a tight radius and a barely-there elevation, not a lifted
 * button. The web hover (`filter: brightness(1.05)`) has no touch
 * equivalent, so it becomes a pressed state (`active:opacity-90`); the web
 * `:disabled` desaturation becomes a flat outline-variant fill.
 */
export default function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-lg px-4 py-3 items-center ${disabled ? "bg-outline-variant" : "bg-enamel active:opacity-90"}`}
      style={{ elevation: disabled ? 0 : 2 }}
    >
      <Text className="text-white font-display text-base">{label}</Text>
    </Pressable>
  );
}
