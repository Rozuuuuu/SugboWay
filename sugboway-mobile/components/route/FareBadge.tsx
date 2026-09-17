import { Text } from "react-native";
import { formatPHP } from "../../domain/fare";

/**
 * Ports sugboway-web's FareBadge, narrowed to a pure display of an
 * already-computed total: the caller (RouteCard) owns the `calculateFare`
 * call, since it also needs the breakdown (`discountedLegFare`, `perLeg`)
 * for the per-leg summary — this component just formats the number.
 */
export default function FareBadge({ farePHP }: { farePHP: number }) {
  return <Text className="font-mono text-on-surface text-sm">{formatPHP(farePHP)}</Text>;
}
