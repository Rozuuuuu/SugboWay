import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "SugboWay",
  slug: "sugboway",
  owner: "lloydros",
  scheme: "sugboway",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  android: {
    package: "ph.sugboway.app",
    adaptiveIcon: { backgroundColor: "#c0392b" },
  },
  plugins: ["expo-router", "expo-secure-store", "@maplibre/maplibre-react-native"],
  extra: {
    routingApiUrl: process.env.ROUTING_API_URL ?? "http://localhost:8080",
    aiApiUrl: process.env.AI_API_URL ?? "http://localhost:8000",
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
    // Added by hand: `eas build:configure` cannot write to a dynamic
    // (TypeScript) config, so it prints this ID and expects you to paste it in.
    // Not a secret — it identifies the public EAS project, and every Expo
    // project carries one.
    eas: { projectId: "052b67e4-da75-4dd8-b347-ab13f488025b" },
  },
};

export default config;
