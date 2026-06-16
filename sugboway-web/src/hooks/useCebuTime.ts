import { useState, useEffect, useRef } from "react";

interface CebuTimeState {
  cebuHour: number;          // 0–23 in Cebu timezone
  cebuMinute: number;
  isPeak: boolean;           // 7–9 AM or 5–8 PM
  peakLabel: string;         // "Morning Rush" | "Evening Rush" | "Off-Peak"
  lastChecked: number;       // timestamp of last computation
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function useCebuTime() {
  const [state, setState] = useState<CebuTimeState>(() => computeCebuTime());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  function computeCebuTime(): CebuTimeState {
    // Force UTC+8 regardless of user's local timezone
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const cebuMs = utcMs + 8 * 3600000;
    const cebuDate = new Date(cebuMs);

    const cebuHour = cebuDate.getHours();
    const cebuMinute = cebuDate.getMinutes();

    const isMorningPeak = cebuHour >= 7 && cebuHour < 9;
    const isEveningPeak = cebuHour >= 17 && cebuHour < 20;
    const isPeak = isMorningPeak || isEveningPeak;

    let peakLabel = "Off-Peak";
    if (isMorningPeak) peakLabel = "Morning Rush";
    else if (isEveningPeak) peakLabel = "Evening Rush";

    return { cebuHour, cebuMinute, isPeak, peakLabel, lastChecked: Date.now() };
  }

  useEffect(() => {
    // Re-check every 15 minutes (battery-optimized debounce)
    intervalRef.current = setInterval(() => {
      setState(computeCebuTime());
    }, CACHE_TTL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return state;
}
