import MaterialIcons from "@expo/vector-icons/MaterialIcons";

/**
 * Replaces the web app's Material Symbols Outlined web font
 * (`className="material-symbols-outlined"`) with Expo's bundled
 * MaterialIcons glyph set — no web font to load, no FOUT.
 */
export default function Icon({
  name,
  size = 20,
  color,
}: {
  name: keyof typeof MaterialIcons.glyphMap;
  size?: number;
  color?: string;
}) {
  return <MaterialIcons name={name} size={size} color={color} />;
}
