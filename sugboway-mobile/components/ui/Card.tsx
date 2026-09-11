import { View, type ViewProps } from "react-native";

/**
 * Ports `.sw-card` from sugboway-web's globals.css: a hairline rule
 * (`border-outline-variant`), a tight 0.625rem (10px) radius, and a
 * minimal shadow — no lift. `box-shadow` becomes Android `elevation`;
 * the web's `.sw-card-interactive:hover` state has no touch equivalent
 * and is dropped rather than faked.
 */
export default function Card({ children, className = "", ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      {...rest}
      className={`bg-surface-container-lowest border border-outline-variant rounded-[10px] ${className}`}
      style={{ elevation: 1 }}
    >
      {children}
    </View>
  );
}
