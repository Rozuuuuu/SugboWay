// NativeWind v4 on native has two independent, incompatible dark-mode paths.
// CSS custom properties (global.css's `.dark { --surface: ...; }`, what this
// file drives) compile to a real React context provider, so a root "dark"
// class propagates to every descendant through expo-router's Stack normally.
// Dark-variant-prefixed classes compile instead to a media condition resolved
// only against the OS Appearance setting at runtime — a "dark" class on an
// ancestor has zero effect on them, silently. So this app uses only bare
// classes (`bg-surface`); never a dark-variant prefix.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Appearance, type ColorSchemeName } from "react-native";

type Theme = "light" | "dark" | "system";

function toResolved(scheme: ColorSchemeName | null | undefined): "light" | "dark" {
  return scheme === "dark" ? "dark" : "light";
}

const KEY = "sugboway-theme";

interface ThemeContextValue {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const Ctx = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
});

export const useTheme = () => useContext(Ctx);

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [system, setSystem] = useState<"light" | "dark">(toResolved(Appearance.getColorScheme()));

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === "light" || v === "dark" || v === "system") setThemeState(v);
      })
      .catch((err) => {
        console.error("Failed to read stored theme, falling back to system:", err);
        setThemeState("system");
      });
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(toResolved(colorScheme)));
    return () => sub.remove();
  }, []);

  const setTheme = (t: Theme) => {
    // Update in-memory state first so the tap visibly works even if the
    // persistence write below fails.
    setThemeState(t);
    AsyncStorage.setItem(KEY, t).catch((err) => {
      console.error("Failed to persist theme choice:", err);
    });
  };

  const resolved = theme === "system" ? system : theme;

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}
