import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "SugboWay",
  slug: "sugboway",
  scheme: "sugboway",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  android: {
    package: "ph.sugboway.app",
    adaptiveIcon: { backgroundColor: "#c0392b" },
  },
  plugins: ["expo-router"],
};

export default config;
