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
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") setThemeState(v);
    });
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(toResolved(colorScheme)));
    return () => sub.remove();
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    AsyncStorage.setItem(KEY, t);
  };

  const resolved = theme === "system" ? system : theme;

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}
