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
  plugins: ["expo-router", "expo-secure-store"],
  extra: {
    routingApiUrl: process.env.ROUTING_API_URL ?? "http://localhost:8080",
    aiApiUrl: process.env.AI_API_URL ?? "http://localhost:8000",
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
  },
};

export default config;
