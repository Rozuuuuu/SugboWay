import { useState, useEffect, useRef } from "react";

interface WeatherState {
  condition: "clear" | "cloudy" | "rain" | "heavy_rain" | "unknown";
  temperature: number | null;
  humidity: number | null;
  betaAdjustment: number;   // Additive BPR beta modifier
  description: string;
  lastFetched: number;
  isLoading: boolean;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Weather is fetched via the routing API's server-side proxy so the weatherapi.com
// key never ships to the browser (it lives in WEATHER_API_KEY on the Go service).
const ROUTING_API_URL = process.env.NEXT_PUBLIC_ROUTING_API_URL ?? "http://localhost:8080";

export function useCebuWeather() {
  const [state, setState] = useState<WeatherState>({
    condition: "unknown",
    temperature: null,
    humidity: null,
    betaAdjustment: 0,
    description: "Weather data unavailable",
    lastFetched: 0,
    isLoading: false,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchWeather = async () => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const res = await fetch(`${ROUTING_API_URL}/api/v1/weather`);

      if (!res.ok) throw new Error(`Weather fetch failed with status ${res.status}`);

      const data = await res.json();

      const text = data?.text || "Clear";
      const lowerText = text.toLowerCase();
      const temp = data?.temp_c ?? null;
      const humidity = data?.humidity ?? null;

      let condition: WeatherState["condition"] = "clear";
      let betaAdjustment = 0;

      if (lowerText.includes("thunderstorm") || lowerText.includes("storm") || lowerText.includes("typhoon") || lowerText.includes("heavy rain")) {
        condition = "heavy_rain";
        betaAdjustment = 1.5;
      } else if (lowerText.includes("rain") || lowerText.includes("drizzle") || lowerText.includes("shower")) {
        condition = "rain";
        betaAdjustment = 1.0;
      } else if (lowerText.includes("cloud") || lowerText.includes("overcast") || lowerText.includes("mist") || lowerText.includes("fog") || lowerText.includes("haze")) {
        condition = "cloudy";
        betaAdjustment = 0.2;
      }

      setState({
        condition,
        temperature: temp,
        humidity: humidity,
        betaAdjustment,
        description: text,
        lastFetched: Date.now(),
        isLoading: false,
      });
    } catch (err) {
      console.warn("[CebuWeather] Weather API fetch failed, using defaults:", err);
      setState(prev => ({
        ...prev,
        condition: "unknown",
        betaAdjustment: 0,
        description: "Weather data temporarily unavailable",
        lastFetched: Date.now(),
        isLoading: false,
      }));
    }
  };

  useEffect(() => {
    fetchWeather();

    // Re-fetch every 15 minutes
    timerRef.current = setInterval(fetchWeather, CACHE_TTL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return state;
}
