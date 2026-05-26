import { useState, useEffect } from "react";

export function useOfflineMap() {
  const [isOffline, setIsOffline] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize state
    setIsOffline(!navigator.onLine);

    const handleOnline = () => {
      console.log("[SugboWay] App is online. Switching to OpenFreeMap.");
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
    : "https://tiles.openfreemap.org/styles/bright";

  return { isOffline, mapStyle };
}
