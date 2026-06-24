import { useState, useEffect, useRef } from "react";

interface CebuTimeState {
  cebuHour: number;          // 0–23 in Cebu timezone
  cebuMinute: number;
  isPeak: boolean;           // 7–9 AM or 5–8 PM
  peakLabel: string;         // "Morning Rush" | "Evening Rush" | "Off-Peak"
  lastChecked: number;       // timestamp of last computation
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Deterministic first-render value shared by server and client. Real time is
// computed in useEffect after mount, so SSR and hydration produce identical
// markup (avoids React hydration error #418 from a server-vs-client clock).
const INITIAL_TIME: CebuTimeState = {
  cebuHour: 12,
  cebuMinute: 0,
  isPeak: false,
  peakLabel: "Off-Peak",
  lastChecked: 0,
};

export function useCebuTime() {
  const [state, setState] = useState<CebuTimeState>(INITIAL_TIME);
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
    // Compute the real Cebu time once mounted (client only), then keep ticking.
    setState(computeCebuTime());
    intervalRef.current = setInterval(() => {
      setState(computeCebuTime());
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return state;
}
