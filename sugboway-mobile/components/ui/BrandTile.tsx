import { View } from "react-native";
import BrandMark from "./BrandMark";

/**
 * Ports `.sw-brand-tile` from sugboway-web's globals.css: a flat enamel
 * plate carrying the BrandMark, tight 0.5rem radius, minimal shadow
 * (`box-shadow` → Android `elevation`) — no gradient, no lift.
 */
export default function BrandTile({ size = 40 }: { size?: number }) {
  return (
    <View
      className="bg-enamel rounded-lg items-center justify-center"
      style={{ width: size, height: size, elevation: 2 }}
    >
      <BrandMark size={size * 0.6} mono />
    </View>
  );
}
