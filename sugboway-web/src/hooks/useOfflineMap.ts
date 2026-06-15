import { useState, useEffect } from "react";

const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export function useOfflineMap(isDark: boolean = false) {
  const [isOffline, setIsOffline] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize state
    setIsOffline(!navigator.onLine);

    const handleOnline = () => {
      console.log("[SugboWay] App is online. Switching to CARTO basemap.");
      setIsOffline(false);
    };

    const handleOffline = () => {
      console.log("[SugboWay] App is offline. Switching to local PMTiles map.");
      setIsOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const mapStyle = isOffline
    ? "/offline-style.json"
    : isDark
      ? CARTO_DARK
      : CARTO_LIGHT;

  return { isOffline, mapStyle };
}
