import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const ROUTING_API_URL = extra.routingApiUrl ?? "http://localhost:8080";
export const AI_API_URL = extra.aiApiUrl ?? "http://localhost:8000";
export const GOOGLE_WEB_CLIENT_ID = extra.googleWebClientId;
