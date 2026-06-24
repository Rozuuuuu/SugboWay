"use client";

import React, { useState, useEffect, useRef } from "react";
import type { RouteResult, PassengerType, RouteLeg } from "@/domain";
import RouteCard from "@/components/route/RouteCard";
import RouteCodeBadge from "@/components/route/RouteCodeBadge";
import PlaceDropdown from "@/components/route/PlaceDropdown";
import { searchPlaces, type Place } from "@/data/places";
import NavigationDrawer from "@/components/route/NavigationDrawer";
import ProximityAlert from "@/components/route/ProximityAlert";
import { calculateFare, formatPHP } from "@/domain";
import maplibregl from "maplibre-gl";
import type { Map, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { useOfflineMap } from "@/hooks/useOfflineMap";
import { useProximityEtiquette } from "@/hooks/useProximityEtiquette";
import { useTheme } from "@/components/ThemeProvider";
import ThemeToggle from "@/components/ThemeToggle";
import { useCebuTime } from "@/hooks/useCebuTime";
import { useCebuWeather } from "@/hooks/useCebuWeather";
import PeakWarning from "@/components/route/PeakWarning";

// Register PMTiles protocol handler globally once in the browser environment
if (typeof window !== "undefined") {
  const p = new Protocol();
  try {
    maplibregl.addProtocol("pmtiles", p.tile);
  } catch (e) {
    console.warn("[SugboWay] PMTiles protocol already registered or failed to register:", e);
  }
}

// Helper to format travel time into readable hours and minutes
function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""}`;
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) return `${hrs} hr${hrs !== 1 ? "s" : ""}`;
  return `${hrs} hr${hrs !== 1 ? "s" : ""} ${remainingMins} min${
    remainingMins !== 1 ? "s" : ""
  }`;
}

// Helper to format distance into readable meters or kilometers
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Mock data generator for transit routes in Cebu
const MOCK_ROUTES: RouteResult[] = [
  {
    totalTimeSeconds: 900, // 15 mins
    totalFarePHP: 13.0,
    transfers: 0,
    crowdingWorstLeg: 0.22, // Comfortable (Green)
    geoJson: { type: "FeatureCollection", features: [] },
    legs: [
      {
        type: "transit",
        routeId: "route_13c",
        routeShortName: "13C",
        route: {
          routeId: "route_13c",
          routeShortName: "13C",
          routeLongName: "Talamban - Colon via Ramos",
          routeType: "modern_ejeep",
          agencyId: "LTFRB-R7",
          isModernized: true,
          hasAircon: true,
          hasConductor: false,
        },
        fromStop: {
          stopId: "talamban_term",
          stopName: "Talamban Grand Terminal",
          aliases: ["Talamban Gym", "Talamban Terminal"],
          location: { lat: 10.3705, lon: 123.9181 },
          routeIds: ["13C", "13B"],
          wheelchairAccessible: true,
          hasShelter: true,
          isTerminal: true,
        },
        toStop: {
          stopId: "colon_ramos",
          stopName: "Colon St. corner Ramos St.",
          aliases: ["Ramos Colon Intersection", "Metro Colon"],
          location: { lat: 10.2985, lon: 123.9016 },
          routeIds: ["13C", "17B", "04L"],
          wheelchairAccessible: true,
          hasShelter: true,
          isTerminal: false,
        },
        durationSeconds: 900,
        distanceMeters: 4500, // 4.5km
        farePHP: 13.0,
        instructions: [
          {
            step: 1,
            action: "board",
            description: "Board the Modern Aircon E-Jeep 13C at Talamban Grand Terminal.",
            cebuanoPhrase: "Plete palihug",
            culturalCue: "Hand your fare to the passenger next to you if you are far from the driver",
            landmark: "Gaisano Grand Talamban",
          },
          {
            step: 2,
            action: "ride",
            description: "Ride for 4.5km along Gov. M. Cuenco Ave and F. Ramos St.",
            landmark: "Cebu Institute of Medicine",
          },
          {
            step: 3,
            action: "alight",
            description: "Alight at Colon St. corner Ramos St.",
            cebuanoPhrase: "Lugar lang sa unahan",
            culturalCue: "Say 'Lugar lang' clearly or knock on the handrail to signal the driver to stop",
            landmark: "Metro Colon",
          },
        ],
      },
    ],
  },
  {
    totalTimeSeconds: 1500, // 25 mins
    totalFarePHP: 13.0,
    transfers: 0,
    crowdingWorstLeg: 0.65, // Crowded (Orange)
    geoJson: { type: "FeatureCollection", features: [] },
    legs: [
      {
        type: "transit",
        routeId: "route_17b",
        routeShortName: "17B",
        route: {
          routeId: "route_17b",
          routeShortName: "17B",
          routeLongName: "Apas - Colon via Ramos",
          routeType: "jeepney",
          agencyId: "LTFRB-R7",
          isModernized: false,
          hasAircon: false,
          hasConductor: true,
        },
        fromStop: {
          stopId: "apas_gym",
          stopName: "Apas Barangay Hall",
          aliases: ["Apas Gym"],
          location: { lat: 10.3392, lon: 123.9048 },
          routeIds: ["17B", "17D"],
          wheelchairAccessible: false,
          hasShelter: false,
          isTerminal: true,
        },
        toStop: {
          stopId: "colon_metro",
          stopName: "Metro Colon Shopping Mall",
          aliases: ["Metro Colon", "Gaisano Colon"],
          location: { lat: 10.2979, lon: 123.9022 },
          routeIds: ["17B", "13C", "04L"],
          wheelchairAccessible: false,
          hasShelter: true,
          isTerminal: false,
        },
        durationSeconds: 1500,
        distanceMeters: 6200, // 6.2km
        farePHP: 13.0,
        instructions: [
          {
            step: 1,
            action: "board",
            description: "Board the Traditional Jeepney 17B at Apas Barangay Hall.",
            cebuanoPhrase: "Pliti palihug",
            culturalCue: "Standard traditional fare collection is passenger-to-passenger pass along",
            landmark: "Apas Sports Complex",
          },
          {
            step: 2,
            action: "ride",
            description: "Ride for 6.2km passing F. Cabahug St. and Ramos St.",
            landmark: "USP Campus",
          },
          {
            step: 3,
            action: "alight",
            description: "Alight at Metro Colon Shopping Mall.",
            cebuanoPhrase: "Lugar lang",
            culturalCue: "Tap a coin on the ceiling's metal pipe if the driver can't hear you",
            landmark: "Metro Colon",
          },
        ],
      },
    ],
  },
  {
    totalTimeSeconds: 1920, // 32 mins
    totalFarePHP: 15.0,
    transfers: 1,
    crowdingWorstLeg: 0.95, // Packed (Pulsing Red)
    geoJson: { type: "FeatureCollection", features: [] },
    legs: [
      {
        type: "walking",
        fromStop: {
          stopId: "it_park_center",
          stopName: "Cebu IT Park Center",
          aliases: ["IT Park", "The Walk"],
          location: { lat: 10.3298, lon: 123.9061 },
          routeIds: ["04L", "17B"],
          wheelchairAccessible: true,
          hasShelter: true,
          isTerminal: false,
        },
        toStop: {
          stopId: "it_park_terminal",
          stopName: "IT Park Transit Terminal",
          aliases: ["IT Terminal"],
          location: { lat: 10.3314, lon: 123.9075 },
          routeIds: ["04L", "MyBus"],
          wheelchairAccessible: true,
          hasShelter: true,
          isTerminal: true,
        },
        durationSeconds: 240,
        distanceMeters: 300, // 300m walk
        instructions: [
          {
            step: 1,
            action: "walk",
            description: "Walk 300m north-east along Abad St to IT Park Transit Terminal.",
            landmark: "The Walk IT Park",
          },
        ],
      },
      {
        type: "transit",
        routeId: "route_04l",
        routeShortName: "04L",
        route: {
          routeId: "route_04l",
          routeShortName: "04L",
          routeLongName: "Lahug - IT Park via SM",
          routeType: "jeepney",
          agencyId: "LTFRB-R7",
          isModernized: false,
          hasAircon: false,
          hasConductor: true,
        },
        fromStop: {
          stopId: "it_park_terminal",
          stopName: "IT Park Transit Terminal",
          aliases: ["IT Terminal"],
          location: { lat: 10.3314, lon: 123.9075 },
          routeIds: ["04L", "MyBus"],
          wheelchairAccessible: true,
          hasShelter: true,
          isTerminal: true,
        },
        toStop: {
          stopId: "sm_city_cebu",
          stopName: "SM City Cebu Terminal",
          aliases: ["SM City", "SM Cebu"],
          location: { lat: 10.3118, lon: 123.9183 },
          routeIds: ["04L", "MyBus"],
          wheelchairAccessible: true,
          hasShelter: true,
          isTerminal: false,
        },
        durationSeconds: 1680,
        distanceMeters: 8200, // 8.2km
        farePHP: 15.0,
        instructions: [
          {
            step: 1,
            action: "board",
            description: "Board the Traditional Jeepney 04L at IT Park Transit Terminal.",
            cebuanoPhrase: "Plete palihug",
            culturalCue: "Drivers might wait until the jeepney is fully loaded before leaving",
            landmark: "Sugbo Mercado",
          },
          {
            step: 2,
            action: "ride",
            description: "Ride for 8.2km passing Salinas Drive and Mabolo.",
            landmark: "Mabolo Church",
          },
          {
            step: 3,
            action: "alight",
            description: "Alight at SM City Cebu Terminal.",
            cebuanoPhrase: "Lugar lang, pabor",
            culturalCue: "Raise your hand or tap a coin to signal stop during heavy traffic",
            landmark: "SM City Cebu",
          },
        ],
      },
    ],
  },
  {
    totalTimeSeconds: 2400, // 40 mins
    totalFarePHP: 25.0,
    transfers: 0,
    crowdingWorstLeg: 0.42, // Moderate (Yellow)
    geoJson: { type: "FeatureCollection", features: [] },
    legs: [
      {
        type: "transit",
        routeId: "route_mybus_1",
        routeShortName: "MyBus",
        route: {
          routeId: "route_mybus_1",
          routeShortName: "MyBus",
          routeLongName: "SM Seaside - Ayala Center Cebu via SRP",
          routeType: "mybus",
          agencyId: "Metro-Express",
          isModernized: true,
          hasAircon: true,
          hasConductor: false,
        },
        fromStop: {
          stopId: "sm_seaside",
          stopName: "SM Seaside City Terminal",
          aliases: ["Seaside Mall", "SM SRP"],
          location: { lat: 10.2818, lon: 123.8809 },
          routeIds: ["mybus_srp"],
          wheelchairAccessible: true,
          hasShelter: true,
          isTerminal: true,
        },
        toStop: {
          stopId: "ayala_terminal",
          stopName: "Ayala Center Cebu Terminal",
          aliases: ["Ayala Terminal", "Ayala Hub"],
          location: { lat: 10.3178, lon: 123.9054 },
          routeIds: ["mybus_srp"],
          wheelchairAccessible: true,
          hasShelter: true,
          isTerminal: true,
        },
        durationSeconds: 2400,
        distanceMeters: 12000, // 12.0km
        farePHP: 25.0,
        instructions: [
          {
            step: 1,
            action: "board",
            description: "Tap your e-PRO card or buy a ticket at SM Seaside Terminal to board MyBus.",
            culturalCue: "MyBus uses tap-to-pay Beep cards or cash tickets, no cash accepted on-board",
            landmark: "SM Seaside Cube",
          },
          {
            step: 2,
            action: "ride",
            description: "Ride for 12.0km through the Cebu South Coastal Road (SRP) expressway.",
            landmark: "CCLEX Bridge View",
          },
          {
            step: 3,
            action: "alight",
            description: "Alight at Ayala Center Cebu Transit Terminal.",
            culturalCue: "Bus has automated doors and scheduled stops; wait for the complete stop",
            landmark: "Ayala Center Mall",
          },
        ],
      },
    ],
  },
];

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  cebuanoText?: string;
  timestamp: string;
  suggestedStop?: {
    name: string;
    walkTime: string;
    routeIds: string[];
  };
}

// Predefined fuzzy search mappings for Cebu spots to coordinates
const STOP_COORDINATES: Record<string, { lat: number; lon: number }> = {
  "cebu it park": { lat: 10.3292, lon: 123.9067 },
  "it park": { lat: 10.3292, lon: 123.9067 },
  "talamban": { lat: 10.3662, lon: 123.9169 },
  "talamban gym": { lat: 10.3662, lon: 123.9169 },
  "uc banilad": { lat: 10.3429, lon: 123.9118 },
  "ayala": { lat: 10.3182, lon: 123.9048 },
  "ayala center cebu": { lat: 10.3182, lon: 123.9048 },
  "colon": { lat: 10.2974, lon: 123.8997 },
  "downtown colon st.": { lat: 10.2974, lon: 123.8997 },
  "colon obelisk": { lat: 10.2974, lon: 123.8997 },
  "sm seaside": { lat: 10.2818, lon: 123.8805 },
  "sm seaside city cebu": { lat: 10.2818, lon: 123.8805 },
  "lahug": { lat: 10.3308, lon: 123.8973 },
  "lahug (jy square)": { lat: 10.3308, lon: 123.8973 },
};

function resolveLocation(query: string, defaultCoords: { lat: number; lon: number }): { lat: number; lon: number } {
  const normalized = query.trim().toLowerCase();
  for (const [key, coords] of Object.entries(STOP_COORDINATES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }
  return defaultCoords;
}

// Resolve free text to coordinates, preferring the full Cebu place dataset
// (aliases included) and falling back to the legacy hub table.
function resolvePlaceCoords(query: string, defaultCoords: { lat: number; lon: number }): { lat: number; lon: number } {
  const hit = searchPlaces(query, 1)[0];
  if (hit) return { lat: hit.lat, lon: hit.lon };
  return resolveLocation(query, defaultCoords);
}

// Build a RouteResult from a geometric "serving" match (a route whose shape
// passes near both endpoints). Single direct leg; fare is real (distance-based),
// duration is an estimate at ~16 km/h average city speed.
function servingToRouteResult(
  s: any,
  originLabel: string,
  originCoords: { lat: number; lon: number },
  destLabel: string,
  destCoords: { lat: number; lon: number },
  passengerType: PassengerType
): RouteResult {
  const distanceMeters = Number(s.distanceMeters) || 0;
  const distanceKm = distanceMeters / 1000;
  const fare = calculateFare(distanceKm, passengerType, 0).totalFare;
  const durationSeconds = Math.max(300, Math.round((distanceKm / 16) * 3600));
  const mkStop = (label: string, c: { lat: number; lon: number }, isTerminal: boolean) => ({
    stopId: `loc_${label.toLowerCase().replace(/\s+/g, "_")}`,
    stopName: label,
    aliases: [],
    location: { lat: c.lat, lon: c.lon },
    routeIds: [s.routeShortName],
    wheelchairAccessible: true,
    hasShelter: false,
    isTerminal,
  });
  const leg = {
    type: "transit",
    routeId: s.routeId,
    routeShortName: s.routeShortName,
    route: {
      routeId: s.routeId,
      routeShortName: s.routeShortName,
      routeLongName: s.routeLongName,
      routeType: s.isModernized ? "modern_ejeep" : "jeepney",
      agencyId: "CCT",
      isModernized: !!s.isModernized,
      hasAircon: !!s.hasAircon,
      hasConductor: s.hasConductor !== false,
    },
    fromStop: mkStop(originLabel || "Origin", originCoords, true),
    toStop: mkStop(destLabel || "Destination", destCoords, false),
    durationSeconds,
    distanceMeters,
    farePHP: fare,
    instructions: [],
  } as unknown as RouteLeg;
  return {
    totalTimeSeconds: durationSeconds,
    totalFarePHP: fare,
    transfers: 0,
    crowdingWorstLeg: 0.3,
    geoJson: { type: "FeatureCollection", features: [] },
    legs: [leg],
  } as RouteResult;
}

const ROUTING_API_URL = process.env.NEXT_PUBLIC_ROUTING_API_URL || "http://localhost:8080";
const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || "http://localhost:8000";

// --- Persistent route-track layer (dynamic geometry without re-rendering the base map) ---
const ROUTE_TRACK_SOURCE = "route-track";
const ROUTE_TRACK_LAYER = "route-track-line";
const ROUTE_STOPS_SOURCE = "route-stops";
const ROUTE_STOPS_LAYER = "route-stops-dots";

const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection", features: [] as any[] };

// Idempotently attach the persistent track + stop-dot layers to a map.
// Safe to call repeatedly and after a style swap (online/offline toggle wipes layers).
function ensureRouteTrackLayers(map: Map) {
  if (!map.getSource(ROUTE_TRACK_SOURCE)) {
    map.addSource(ROUTE_TRACK_SOURCE, { type: "geojson", data: EMPTY_FEATURE_COLLECTION as any });
  }
  if (!map.getLayer(ROUTE_TRACK_LAYER)) {
    map.addLayer({
      id: ROUTE_TRACK_LAYER,
      type: "line",
      source: ROUTE_TRACK_SOURCE,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#0056B3", "line-width": 4, "line-opacity": 0.9 },
    });
  }
  // Intermediate stop dots sit in their own source ABOVE the line.
  if (!map.getSource(ROUTE_STOPS_SOURCE)) {
    map.addSource(ROUTE_STOPS_SOURCE, { type: "geojson", data: EMPTY_FEATURE_COLLECTION as any });
  }
  if (!map.getLayer(ROUTE_STOPS_LAYER)) {
    map.addLayer({
      id: ROUTE_STOPS_LAYER,
      type: "circle",
      source: ROUTE_STOPS_SOURCE,
      paint: {
        "circle-radius": 4,
        "circle-color": "#0056B3",
        "circle-opacity": 0.65,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
      },
    });
  }
}

export default function DemoPage() {
  const { theme, setTheme, isDark } = useTheme();
  const { isOffline, mapStyle } = useOfflineMap(isDark);
  
  // Dynamic Cebu environmental awareness hooks
  const { isPeak, peakLabel, cebuHour, cebuMinute } = useCebuTime();
  const { condition: weatherCondition, betaAdjustment, description: weatherDesc, temperature: weatherTemp } = useCebuWeather();

  // Format Cebu Local Time (12-hour AM/PM with accurate minutes)
  const formattedHour = cebuHour % 12 === 0 ? 12 : cebuHour % 12;
  const ampm = cebuHour >= 12 ? "PM" : "AM";
  const formattedMinute = cebuMinute.toString().padStart(2, "0");
  const formattedTime = `${formattedHour}:${formattedMinute} ${ampm}`;

  // Shared States
  const [currentTab, setCurrentTab] = useState<"map" | "rush" | "chat" | "profile">("map");
  const [passengerType, setPassengerType] = useState<PassengerType>("regular");
  const [isSafetyModeActive, setIsSafetyModeActive] = useState(false);
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // Map is collapsible on mobile to give the route list more room.
  const [isMapCollapsed, setIsMapCollapsed] = useState(false);

  // Auto-trigger Late-Night Safety Mode if local time is past 9 PM (21:00) or before 5 AM
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 21 || hour < 5) {
      setIsSafetyModeActive(true);
    }
  }, []);

  // Weather Alert Status & Auto-trigger on change
  const [isWeatherAlertOpen, setIsWeatherAlertOpen] = useState(true);
  useEffect(() => {
    if (weatherCondition && weatherCondition !== "unknown") {
      setIsWeatherAlertOpen(true);
    }
  }, [weatherCondition]);

  // Tab 1: Map & Routing States
  const [routes, setRoutes] = useState<RouteResult[]>(MOCK_ROUTES);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState<number | null>(0);
  const [origin, setOrigin] = useState("Talamban");
  const [destination, setDestination] = useState("Colon");
  const [isTrafficBannerOpen, setIsTrafficBannerOpen] = useState(true);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);

  // Proximity tracking hook for "Lugar lang" alerts
  const selectedRoute = selectedRouteIdx !== null && routes[selectedRouteIdx] ? routes[selectedRouteIdx] : null;
  const activeTransitLeg = selectedRoute?.legs.find((leg) => leg.type === "transit") || null;

  const {
    isApproaching,
    distanceToStop,
    nextStopName,
    isMuted,
    toggleMute,
    dismissAlert,
  } = useProximityEtiquette(isNavDrawerOpen ? activeTransitLeg : null);

  // Freemium Quota & Premium States
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [remainingQuota, setRemainingQuota] = useState(5);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitResetSeconds, setRateLimitResetSeconds] = useState(0);

  // Tab 2: Rush Hour States
  const [gaugeRotate, setGaugeRotate] = useState(45);
  const [selectedHourBar, setSelectedHourBar] = useState<number | null>(3); // 5 PM bar is index 3

  // Tab 3: Chat States
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "ai",
      text: "Maayong adlaw! Where do you want to go in Cebu today? You can ask me about routes, fares, or real-time traffic levels.",
      cebuanoText: "Maayong adlaw! Asa ka gusto moadto karon diri sa Sugbo?",
      timestamp: "10:40 AM",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  // Start/end crowding markers we own (so we clear only ours, never all markers)
  const routeMarkersRef = useRef<Marker[]>([]);
  // Latest track + stop data, so a style swap can restore them onto fresh layers
  const trackDataRef = useRef<any>(EMPTY_FEATURE_COLLECTION);
  const stopsDataRef = useRef<any>(EMPTY_FEATURE_COLLECTION);

  // Smoothly move the camera to a picked hub (e.g. "TC" -> USC Talamban).
  const flyToPlace = (place: Place) => {
    setCurrentTab("map");
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [place.lon, place.lat], zoom: 15, duration: 900 });
  };

  // Fetch optimal routes from Go Fiber Routing Engine
  const fetchRoutes = async () => {
    setIsRoutingLoading(true);
    setRoutingError(null);
    try {
      const originCoords = resolvePlaceCoords(origin, { lat: 10.3662, lon: 123.9169 });
      const destCoords = resolvePlaceCoords(destination, { lat: 10.2974, lon: 123.8997 });

      const searchUrl = `${ROUTING_API_URL}/api/v1/route/search?origin_lat=${originCoords.lat}&origin_lon=${originCoords.lon}&dest_lat=${destCoords.lat}&dest_lon=${destCoords.lon}&passenger_type=${passengerType}&accessible=${isSafetyModeActive}`;
      const servingUrl = `${ROUTING_API_URL}/api/v1/routes/serving?origin_lat=${originCoords.lat}&origin_lon=${originCoords.lon}&dest_lat=${destCoords.lat}&dest_lon=${destCoords.lon}&radius=700`;

      // Fetch graph routes (Dijkstra) and geometric direct routes in parallel.
      // A 404 from /route/search just means "no scheduled-graph route" (normal
      // for routes without stop_times) — treat it as empty, not a failure.
      const [searchSettled, servingSettled] = await Promise.allSettled([
        fetch(searchUrl).then((r) =>
          r.ok ? r.json() : r.status === 404 ? [] : Promise.reject(new Error(`search ${r.status}`))
        ),
        fetch(servingUrl)
          .then((r) => (r.ok ? r.json() : r.status === 404 ? { serving: [] } : null))
          .catch(() => null),
      ]);

      // 1. Dijkstra results (rich legs/transfers), enriched with live congestion.
      let dijkstraRoutes: RouteResult[] = [];
      if (searchSettled.status === "fulfilled" && Array.isArray(searchSettled.value)) {
        dijkstraRoutes = await Promise.all(searchSettled.value.map(async (route: RouteResult) => {
          let maxCrowding = 0.25;
          const enrichedLegs = await Promise.all(route.legs.map(async (leg: RouteLeg) => {
            if (leg.type === "transit" && leg.routeId) {
              try {
                const congRes = await fetch(
                  `${ROUTING_API_URL}/api/v1/congestion?route_id=${leg.routeId}&is_peak=${isPeak}&weather_beta=${4.0 + betaAdjustment}`
                );
                if (congRes.ok) {
                  const congData = await congRes.json();
                  let score = congData.flow_ratio ?? 0.25;
                  if (congData.is_peak) score = Math.min(score * 1.2, 1.0);
                  leg.fromStop.crowdingScore = score;
                  leg.toStop.crowdingScore = score;
                  if (score > maxCrowding) maxCrowding = score;
                }
              } catch (e) {
                // Fail silently and use fallback
              }
            }
            return leg;
          }));
          return { ...route, legs: enrichedLegs, crowdingWorstLeg: maxCrowding };
        }));
      }

      // 2. Geometric direct routes: every route whose shape passes near O and D.
      // This surfaces ALL routes (incl. ones with no scheduled stop_times) so the
      // results aren't limited to the Dijkstra graph.
      let servingRoutes: RouteResult[] = [];
      if (servingSettled.status === "fulfilled" && servingSettled.value?.serving) {
        const seen = new Set(
          dijkstraRoutes.map((r) => r.legs[0]?.routeShortName).filter(Boolean)
        );
        servingRoutes = (servingSettled.value.serving as any[])
          .filter((s) => !seen.has(s.routeShortName))
          .map((s) =>
            servingToRouteResult(s, origin, originCoords, destination, destCoords, passengerType)
          );
      }

      const merged = [...dijkstraRoutes, ...servingRoutes];

      // Only surface an error if BOTH endpoints failed to respond at all
      // (network/down). An empty-but-successful result is a clean "no routes",
      // not an error.
      const searchHardFail = searchSettled.status === "rejected";
      const servingHardFail =
        servingSettled.status !== "fulfilled" || servingSettled.value == null;
      if (merged.length === 0 && searchHardFail && servingHardFail) {
        throw new Error("Couldn't reach the routing service. Check your connection and try again.");
      }

      setRoutes(merged);
      setSelectedRouteIdx(merged.length > 0 ? 0 : null);
    } catch (err: any) {
      setRoutes([]);
      setSelectedRouteIdx(null);
      setRoutingError(err.message || "Couldn't reach the routing service.");
    } finally {
      setIsRoutingLoading(false);
    }
  };

  // Trigger route fetch when preferences change
  useEffect(() => {
    fetchRoutes();
  }, [passengerType, isSafetyModeActive]);

  // Initialize MapLibre GL Map snapped to Cebu City
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: [123.89, 10.31], // Metro Cebu coordinates
      zoom: 13,
    });

    // Restore the persistent track + stop layers and their current data.
    // Runs on first load AND after every style swap (offline/online wipes layers).
    const restoreRouteLayers = () => {
      ensureRouteTrackLayers(map);
      (map.getSource(ROUTE_TRACK_SOURCE) as any)?.setData(trackDataRef.current);
      (map.getSource(ROUTE_STOPS_SOURCE) as any)?.setData(stopsDataRef.current);
    };

    map.once("load", () => {
      map.resize();
      restoreRouteLayers();

      // Lightweight popup for the intermediate stop dots (parity with old markers)
      map.on("click", ROUTE_STOPS_LAYER, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const name = (f.properties as any)?.name ?? "Stop";
        const [lon, lat] = (f.geometry as any).coordinates;
        new maplibregl.Popup({ offset: 8 })
          .setLngLat([lon, lat])
          .setHTML(`<b>${name}</b>`)
          .addTo(map);
      });
      map.on("mouseenter", ROUTE_STOPS_LAYER, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", ROUTE_STOPS_LAYER, () => { map.getCanvas().style.cursor = ""; });
    });

    // setStyle() (offline/online toggle) drops custom layers — re-add on every style load
    map.on("style.load", restoreRouteLayers);

    // Handle initial zero-size container hydration delay
    setTimeout(() => {
      map.resize();
    }, 100);
    setTimeout(() => {
      map.resize();
    }, 500);

    mapRef.current = map;

    return () => {
      map.remove();
    };
  }, []);

  // Update map style when switching between online/offline modes
  const lastStyleRef = useRef<string>(mapStyle);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lastStyleRef.current !== mapStyle) {
      map.setStyle(mapStyle);
      lastStyleRef.current = mapStyle;
    }
  }, [mapStyle]);

  // Call map.resize() when switching back to the map tab, or when the map is
  // re-expanded on mobile, to prevent a grey/blank canvas after a size change.
  useEffect(() => {
    if (currentTab === "map" && !isMapCollapsed && mapRef.current) {
      // Wait for the height transition to finish before resizing.
      setTimeout(() => {
        mapRef.current?.resize();
      }, 320);
    }
  }, [currentTab, isMapCollapsed]);

  // Update Route Polyline and Markers on Selected Route index change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawOnMap = async () => {
      // The map can become visible (display:none -> block) when a card is
      // selected, so re-sync the canvas size before drawing/fitting bounds.
      map.resize();

      // Persistent layers must exist before we push data into them.
      ensureRouteTrackLayers(map);

      // Clear only the start/end markers WE created (never wipe all DOM markers).
      routeMarkersRef.current.forEach((m) => m.remove());
      routeMarkersRef.current = [];

      // No valid selection -> clear the track + dots so a stale route never
      // lingers on the map (without touching the base tiles).
      const selectedRoute = selectedRouteIdx !== null ? routes[selectedRouteIdx] : null;
      if (!selectedRoute) {
        trackDataRef.current = EMPTY_FEATURE_COLLECTION;
        stopsDataRef.current = EMPTY_FEATURE_COLLECTION;
        (map.getSource(ROUTE_TRACK_SOURCE) as any)?.setData(EMPTY_FEATURE_COLLECTION);
        (map.getSource(ROUTE_STOPS_SOURCE) as any)?.setData(EMPTY_FEATURE_COLLECTION);
        return;
      }

      // Parallel fetch: shape geometry + intermediate stops for all transit legs
      const transitLegs = selectedRoute.legs.filter(
        (leg) => leg.type === "transit" && leg.routeId
      );

      const [shapeResults, stopResults] = await Promise.all([
        // Fetch shapes for all transit legs in parallel
        Promise.allSettled(
          transitLegs.map((leg) =>
            fetch(`${ROUTING_API_URL}/api/v1/route/shape?route_id=${leg.routeId}`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
        ),
        // Fetch stops for all transit legs in parallel
        Promise.allSettled(
          transitLegs.map((leg) =>
            fetch(`${ROUTING_API_URL}/api/v1/route/stops?route_id=${leg.routeId}`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
        ),
      ]);

      // Build GeoJSON features from fetched shapes (with fallback)
      let shapeFeatures: any[] = [];
      shapeResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value?.geojson) {
          try {
            const parsed = JSON.parse(result.value.geojson);
            shapeFeatures.push({ type: "Feature", geometry: parsed });
          } catch { /* skip malformed */ }
        }
      });

      // Fallback: straight-line interpolation from stop coordinates
      if (shapeFeatures.length === 0) {
        const coordinates: [number, number][] = [];
        selectedRoute.legs.forEach((leg) => {
          coordinates.push([leg.fromStop.location.lon, leg.fromStop.location.lat]);
          coordinates.push([leg.toStop.location.lon, leg.toStop.location.lat]);
        });
        shapeFeatures = [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: coordinates,
            },
          },
        ];
      }

      const trackGeoJson = { type: "FeatureCollection", features: shapeFeatures };

      // Build the intermediate stop dots as a GeoJSON layer (stays above the line).
      const stopFeatures: any[] = [];
      stopResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value?.stops) {
          (result.value.stops || []).forEach((stop: any) => {
            stopFeatures.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: [stop.location.lon, stop.location.lat] },
              properties: { name: stop.stopName },
            });
          });
        }
      });
      const stopsGeoJson = { type: "FeatureCollection", features: stopFeatures };

      // Update the TRACK, not the map: only the in-memory data arrays change,
      // so MapLibre keeps the base tiles/style and just redraws the geometry.
      trackDataRef.current = trackGeoJson;
      stopsDataRef.current = stopsGeoJson;
      (map.getSource(ROUTE_TRACK_SOURCE) as any)?.setData(trackGeoJson);
      (map.getSource(ROUTE_STOPS_SOURCE) as any)?.setData(stopsGeoJson);

      // Start/End markers stay interactive DOM markers (crowding color + popup).
      selectedRoute.legs.forEach((leg) => {
        const elFrom = document.createElement("div");
        const crowdScore = leg.fromStop.crowdingScore ?? 0.22;
        const colorClass = crowdScore > 0.8 ? "bg-error" : crowdScore > 0.5 ? "bg-alert-amber" : "bg-safe-green";
        elFrom.className = `w-4 h-4 rounded-full border-2 border-white shadow-md ${colorClass}`;
        const fromMarker = new maplibregl.Marker(elFrom)
          .setLngLat([leg.fromStop.location.lon, leg.fromStop.location.lat])
          .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(`<h6><b>${leg.fromStop.stopName}</b></h6><p>Crowding: ${Math.round(crowdScore * 100)}%</p>`))
          .addTo(map);
        routeMarkersRef.current.push(fromMarker);

        const elTo = document.createElement("div");
        const toCrowdScore = leg.toStop.crowdingScore ?? 0.22;
        const toColorClass = toCrowdScore > 0.8 ? "bg-error" : toCrowdScore > 0.5 ? "bg-alert-amber" : "bg-safe-green";
        elTo.className = `w-4 h-4 rounded-full border-2 border-white shadow-md ${toColorClass}`;
        const toMarker = new maplibregl.Marker(elTo)
          .setLngLat([leg.toStop.location.lon, leg.toStop.location.lat])
          .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(`<h6><b>${leg.toStop.stopName}</b></h6><p>Crowding: ${Math.round(toCrowdScore * 100)}%</p>`))
          .addTo(map);
        routeMarkersRef.current.push(toMarker);
      });

      // Move the camera to the route's bounding box — no tile reload.
      try {
        const coords: [number, number][] = [];
        trackGeoJson.features.forEach((feat) => {
          if (feat.geometry.type === "LineString") {
            coords.push(...(feat.geometry.coordinates as [number, number][]));
          }
        });
        if (coords.length > 0) {
          const bounds = coords.reduce(
            (b, coord) => b.extend(coord),
            new maplibregl.LngLatBounds(coords[0], coords[0])
          );
          map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
        }
      } catch (e) {
        // Fallback gracefully if bounds fit fails
      }
    };

    if (map.isStyleLoaded()) {
      drawOnMap().catch(console.error);
    } else {
      map.once("style.load", () => drawOnMap().catch(console.error));
    }
  }, [selectedRouteIdx, routes]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isAiLoading]);

  // Traffic Gauge Pointer Jitter Effect
  useEffect(() => {
    const interval = setInterval(() => {
      const baseVal = isSafetyModeActive ? -40 : 45; // Safety Mode shows better flow
      const jitter = (Math.random() - 0.5) * 6;
      setGaugeRotate(baseVal + jitter);
    }, 2500);
    return () => clearInterval(interval);
  }, [isSafetyModeActive]);

  // Send message to FastAPI AI assistant layer (Port 8000)
  const askAi = async (question: string) => {
    setIsAiLoading(true);
    try {
      const res = await fetch(`${AI_API_URL}/api/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: question }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          const errData = await res.json().catch(() => ({}));
          setIsRateLimited(true);
          setRateLimitResetSeconds(errData.reset_seconds || 3600);
          
          setChatMessages((prev) => [
            ...prev,
            {
              id: String(prev.length + 1),
              sender: "ai",
              text: `You've used your 5 free questions for this hour. Go Premium for unlimited route planning, or check back in a bit.`,
              cebuanoText: "Nahurot na imong 5 ka libreng pangutana karong orasa. Pwede ka mag-Premium para walay limit.",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          ]);
          setIsAiLoading(false);
          return;
        }
        throw new Error(`AI request failed: ${res.statusText}`);
      }

      const data = await res.json();
      if (typeof data.remaining === "number") {
        setRemainingQuota(data.remaining);
      }
      const replyText = data.reply || "Sorry, I encountered an issue parsing the response.";

      // Check if the reply lists any specific Cebuano suggestions or stops
      let suggestedStop = undefined;
      const lowerReply = replyText.toLowerCase();
      if (lowerReply.includes("ayala")) {
        suggestedStop = {
          name: "Ayala Transit Terminal Hub",
          walkTime: "4 mins walk",
          routeIds: ["13C", "04L"],
        };
      } else if (lowerReply.includes("it park") || lowerReply.includes("lahug")) {
        suggestedStop = {
          name: "Cebu IT Park Transit Terminal",
          walkTime: "5 mins walk",
          routeIds: ["04L", "MyBus", "17B"],
        };
      } else if (lowerReply.includes("colon")) {
        suggestedStop = {
          name: "Colon Obelisk Station",
          walkTime: "2 mins walk",
          routeIds: ["13C", "17B"],
        };
      }

      const newAiMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: "ai",
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedStop,
      };

      setChatMessages((prev) => [...prev, newAiMsg]);
    } catch (err: any) {
      console.error(err);
      
      // Resilient fallback to offline mock responses in case server is down
      let fallbackText = "I am currently operating in resilient offline mode. LTFRB fare is ₱13.00 for the first 4km and ₱1.80 per extra km.";
      let fallbackCeb = "Naka-offline mode ko karon. Ang plete kay ₱13.00 sa unang 4km unya dungag ₱1.80 kada km.";
      
      if (question.toLowerCase().includes("fare") || question.toLowerCase().includes("plete")) {
        fallbackText = "According to LTFRB regulations, Cebu base fare is ₱13.00 for traditional jeepneys and ₱15.00 for modern e-jeeps.";
        fallbackCeb = "Matod sa LTFRB, ang pliti kay ₱13.00 sa traditional ug ₱15.00 sa modernong e-jeep.";
      }

      const newAiMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: "ai",
        text: fallbackText,
        cebuanoText: fallbackCeb,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setChatMessages((prev) => [...prev, newAiMsg]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleQuickQuestion = (question: string) => {
    const newUserMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, newUserMsg]);
    askAi(question);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userText = inputText;
    setInputText("");

    const newUserMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, newUserMsg]);
    askAi(userText);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen bg-background">
      
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-surface border-r border-outline-variant p-4 gap-6 theme-transition">
        <div className="flex items-center gap-3 px-1 py-2">
          <img src="/Logo.png" alt="SugboWay" className="w-9 h-9 object-contain rounded-lg" />
          <div className="flex flex-col leading-tight">
            <h1 className="text-base font-bold text-on-surface">SugboWay</h1>
            <span className="text-xs text-on-surface-variant">Cebu transit</span>
          </div>
        </div>

        {/* Sidebar Nav Buttons */}
        <nav className="flex-1 space-y-1">
          {[
            { id: "map", label: "Routes", icon: "map" },
            { id: "rush", label: "Traffic", icon: "analytics" },
            { id: "chat", label: "Ask", icon: "forum" },
            { id: "profile", label: "Profile", icon: "person" },
          ].map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id as any)}
                className={`
                  w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm font-semibold
                  transition-colors duration-150 select-none
                  ${
                    isActive
                      ? "bg-cebu-blue/10 text-cebu-blue"
                      : "text-on-surface-variant hover:bg-surface-container"
                  }
                `}
              >
                <span
                  className="material-symbols-outlined text-xl"
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Theme Toggle in Sidebar */}
        <div className="pt-2 border-t border-outline-variant/40">
          <ThemeToggle className="w-full justify-start" />
        </div>

        {/* Brand Footer */}
        <p className="text-xs text-outline">© 2026 SugboWay</p>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-h-screen">
        
        {/* Top AppBar */}
        <header className="sticky top-0 z-40 flex justify-between items-center px-4 h-16 safe-top bg-surface/90 backdrop-blur border-b border-outline-variant theme-transition">
          <div className="flex items-center gap-2.5">
            <img src="/Logo.png" alt="SugboWay" className="md:hidden w-8 h-8 object-contain rounded-lg" />
            <h1 className="text-lg font-bold text-on-surface md:text-base md:text-on-surface-variant md:font-semibold">
              <span className="md:hidden">SugboWay</span>
              <span className="hidden md:inline">
                {currentTab === "map" && "Routes"}
                {currentTab === "rush" && "Traffic"}
                {currentTab === "chat" && "Ask SugboWay"}
                {currentTab === "profile" && "Profile"}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Cebu Time & Weather */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-on-surface-variant">
              <span className="tabular-nums">{formattedTime}</span>
              <span className="w-px h-3 bg-outline-variant" />
              <span className="material-symbols-outlined text-[15px] text-clay">
                {weatherCondition === "rain" || weatherCondition === "heavy_rain" ? "rainy" : weatherCondition === "cloudy" ? "cloud" : "wb_sunny"}
              </span>
              <span className="tabular-nums">{weatherTemp !== null ? `${Math.round(weatherTemp)}°` : "—"}</span>
            </div>

            {/* Live status dot */}
            <div className="hidden md:flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
              <span className={`w-1.5 h-1.5 rounded-full ${isSafetyModeActive ? "bg-aircon-cyan" : "bg-safe-green"}`} />
              <span>{isSafetyModeActive ? "Safety mode" : "Live"}</span>
            </div>

            <ThemeToggle className="md:hidden" />
          </div>
        </header>

        {/* Tab Specific Content Area */}
        <div className="flex-1 p-4 md:py-6 max-w-4xl w-full mx-auto pb-32 md:pb-6 space-y-6">
          
          {/* Weather Alert/Notification Banner */}
          {isWeatherAlertOpen && weatherCondition !== "unknown" && (
            <div 
              className={`
                relative overflow-hidden rounded-2xl border p-4 shadow-sm flex items-start justify-between gap-4 transition-all duration-300 animate-[fadeIn_0.3s_ease-out]
                ${
                  weatherCondition === "rain" || weatherCondition === "heavy_rain"
                    ? "bg-amber-500/10 dark:bg-amber-500/15 border-amber-500/30 text-amber-900 dark:text-amber-200"
                    : "bg-blue-500/10 dark:bg-blue-500/15 border-blue-500/30 text-blue-900 dark:text-blue-200"
                }
              `}
            >
              {/* Decorative side pulse */}
              <div 
                className={`
                  absolute top-0 left-0 bottom-0 w-1
                  ${
                    weatherCondition === "rain" || weatherCondition === "heavy_rain"
                      ? "bg-amber-500"
                      : "bg-blue-500"
                  }
                `} 
              />
              
              <div className="flex gap-3 items-start flex-1 min-w-0">
                <span className={`material-symbols-outlined text-2xl shrink-0 mt-0.5 ${weatherCondition === "rain" || weatherCondition === "heavy_rain" ? "text-amber-600 dark:text-amber-400 animate-pulse" : "text-blue-600 dark:text-blue-400"}`}>
                  {weatherCondition === "heavy_rain" ? "thunderstorm" : weatherCondition === "rain" ? "rainy" : weatherCondition === "cloudy" ? "cloud" : "wb_sunny"}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <span>{weatherDesc}</span>
                    <span className="text-on-surface-variant font-medium">
                      {weatherTemp !== null ? `${weatherTemp}°C` : ""}
                    </span>
                  </h4>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    {weatherCondition === "rain" || weatherCondition === "heavy_rain"
                      ? "Rain across Cebu right now — expect slower jeepneys and heavier traffic. Allow extra time."
                      : "Transit is running normally across the city."}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsWeatherAlertOpen(false)}
                className="p-1.5 rounded-full hover:bg-on-surface/5 text-on-surface-variant transition-colors flex items-center justify-center shrink-0"
                title="Dismiss Weather Notification"
                aria-label="Dismiss Weather Notification"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
          )}

          {/* TAB 1: MAP FINDER */}
          <div className={currentTab === "map" ? "space-y-6 animate-[fadeIn_0.3s_ease-out]" : "hidden"}>
              
              {/* Navigation & Search Area */}
              <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-on-surface">
                  Where are you headed?
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PlaceDropdown
                    label="From"
                    icon="my_location"
                    value={origin}
                    onChange={setOrigin}
                    onSelectPlace={flyToPlace}
                    placeholder="Where are you now?"
                  />
                  <PlaceDropdown
                    label="To"
                    icon="pin_drop"
                    value={destination}
                    onChange={setDestination}
                    onSelectPlace={flyToPlace}
                    placeholder="Where to?"
                  />
                </div>

                {/* Passenger Type Selectors */}
                <div className="pt-2">
                  <span className="block text-xs font-semibold text-on-surface-variant mb-2">
                    Passenger type
                  </span>
                  <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
                    {(["regular", "student", "senior", "pwd"] as PassengerType[]).map((type) => {
                      const isSelected = passengerType === type;
                      const labels: Record<PassengerType, string> = {
                        regular: "Regular",
                        student: "Student (20%)",
                        senior: "Senior (20%)",
                        pwd: "PWD (20%)",
                      };
                      const icons: Record<PassengerType, string> = {
                        regular: "person",
                        student: "school",
                        senior: "elderly",
                        pwd: "accessible",
                      };

                      return (
                        <button
                          key={type}
                          onClick={() => setPassengerType(type)}
                          className={`
                            flex items-center justify-center md:justify-start gap-1.5 px-4 min-h-[48px] py-3 rounded-xl text-sm font-semibold
                            transition-all duration-200 select-none
                            ${
                              isSelected
                                ? "bg-cebu-blue text-white dark:text-on-primary-fixed shadow-xs scale-102 font-extrabold"
                                : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest border border-outline-variant/30"
                            }
                            active:scale-98
                          `}
                        >
                          <span className="material-symbols-outlined text-base">
                            {icons[type]}
                          </span>
                          {labels[type]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Real-time search trigger button */}
                <div className="pt-2">
                  <button
                    onClick={fetchRoutes}
                    disabled={isRoutingLoading}
                    className="w-full bg-cebu-blue hover:bg-primary disabled:bg-cebu-blue/50 text-white dark:text-on-primary-fixed font-bold min-h-[48px] py-3 px-6 rounded-2xl shadow-sm transition-all duration-200 active:scale-98 flex items-center justify-center gap-2 select-none text-sm"
                  >
                    {isRoutingLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Finding routes…</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">search</span>
                        <span>Find routes</span>
                      </>
                    )}
                  </button>
                </div>
              </section>

              {/* Rush Hour Dashboard (Traffic Forecast) */}
              {isTrafficBannerOpen && isPeak && (
                <PeakWarning
                  peakLabel={peakLabel}
                  cebuHour={cebuHour}
                  weatherCondition={weatherCondition}
                  weatherDescription={weatherDesc}
                  temperature={weatherTemp}
                  betaAdjustment={betaAdjustment}
                  onDismiss={() => setIsTrafficBannerOpen(false)}
                />
              )}

              {/* Results with an integrated route map: tap a card -> its track draws above */}
              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-base font-bold text-on-surface">
                    {routes.length} {routes.length === 1 ? "way" : "ways"} to get there
                  </h2>
                  <span className="text-xs text-on-surface-variant capitalize">
                    {passengerType} fare
                  </span>
                </div>

                {/* Route cards. The single map is repositioned (flex order) to sit
                    directly under the selected card, so pressing a card reveals its
                    road track inside the results content. */}
                <div className="flex flex-col gap-4">
                  {/* One persistent map instance — always mounted (so MapLibre is not
                      re-created), shown under the selected card and hidden otherwise. */}
                  <div
                    style={{ order: (selectedRouteIdx ?? 999) * 2 + 1 }}
                    className={`${
                      selectedRouteIdx !== null && routes[selectedRouteIdx] ? "" : "hidden"
                    } -mt-1 bg-surface-container-low border border-outline-variant border-t-0 rounded-b-2xl p-2 shadow-sm`}
                  >
                    {/* Collapse toggle (mobile only — map is always shown on desktop) */}
                    <button
                      onClick={() => setIsMapCollapsed((v) => !v)}
                      className="md:hidden w-full flex items-center justify-between px-1.5 pb-2 pt-1 text-on-surface-variant select-none"
                      aria-expanded={!isMapCollapsed}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <span className="material-symbols-outlined text-base text-cebu-blue">map</span>
                        Road track
                      </span>
                      <span className="flex items-center gap-1 text-xs">
                        {isMapCollapsed ? "Show" : "Hide"}
                        <span className={`material-symbols-outlined text-lg transition-transform duration-300 ${isMapCollapsed ? "" : "rotate-180"}`}>
                          expand_more
                        </span>
                      </span>
                    </button>

                    <div
                      className={`relative rounded-xl overflow-hidden border border-outline-variant bg-surface-container-highest flex items-center justify-center transition-[height] duration-300 ${
                        isMapCollapsed ? "h-0 border-0" : "h-56 sm:h-64"
                      } md:h-72`}
                    >
                      {/* Real MapContainer */}
                      <div
                        ref={mapContainerRef}
                        className="absolute inset-0 z-0 w-full h-full"
                        style={{ position: 'absolute', width: '100%', height: '100%' }}
                      />

                      {/* Offline Mode Banner */}
                      {isOffline && (
                        <div className="absolute top-3 left-3 z-20 bg-surface-container-lowest/90 backdrop-blur border border-outline-variant px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-md text-on-surface-variant">
                          <span className="material-symbols-outlined text-sm text-clay">cloud_off</span>
                          <span className="text-xs font-semibold">Offline map</span>
                        </div>
                      )}

                      {/* Floating voice + ask buttons */}
                      <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
                        <button
                          onClick={() => {
                            setIsRecording(true);
                            setTimeout(() => {
                              setIsRecording(false);
                              setCurrentTab("chat");
                              handleQuickQuestion("pila plete padong colon?");
                            }, 3000); // 3 seconds mock voice capture
                          }}
                          className={`
                            w-11 h-11 rounded-full bg-clay hover:brightness-95 text-white flex items-center justify-center shadow-md transition-all duration-200 relative select-none
                            ${isRecording ? "scale-110" : "active:scale-95"}
                          `}
                          title="Ask by voice"
                        >
                          {isRecording ? (
                            <span className="material-symbols-outlined text-xl animate-pulse">graphic_eq</span>
                          ) : (
                            <span className="material-symbols-outlined text-xl">mic</span>
                          )}
                          {isRecording && (
                            <span className="absolute inset-0 w-full h-full rounded-full border-4 border-clay/40 animate-ping" />
                          )}
                        </button>

                        <button
                          onClick={() => setCurrentTab("chat")}
                          className="w-11 h-11 rounded-full bg-cebu-blue hover:bg-primary text-white flex items-center justify-center shadow-md active:scale-95 select-none"
                          title="Ask SugboWay"
                        >
                          <span className="material-symbols-outlined text-xl">forum</span>
                        </button>
                      </div>

                      {/* Over-Map Control: shows which jeepney/bus is being tracked */}
                      <div className="absolute bottom-3 left-3 right-3 bg-surface-container-lowest/85 backdrop-blur border border-outline-variant rounded-xl px-3 py-2.5 flex justify-between items-center z-10 shadow-sm">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="material-symbols-outlined text-cebu-blue shrink-0">directions_bus</span>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-on-surface truncate">
                              {selectedRouteIdx !== null && routes[selectedRouteIdx] ? `Tracking ${routes[selectedRouteIdx].legs[0]?.routeShortName || "Walk"}` : "Tap a route"}
                            </span>
                            <span className="text-xs text-on-surface-variant truncate">
                              {selectedRouteIdx !== null && routes[selectedRouteIdx] ? `${formatDuration(routes[selectedRouteIdx].totalTimeSeconds)} along the road` : "Its road path shows up here"}
                            </span>
                          </div>
                        </div>

                        {selectedRouteIdx !== null && routes[selectedRouteIdx] && (
                          <button
                            onClick={() => setIsNavDrawerOpen(true)}
                            className="bg-cebu-blue hover:bg-primary text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                          >
                            <span className="material-symbols-outlined text-sm">navigation</span>
                            Ride
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isRoutingLoading ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-surface-container-low rounded-2xl border border-outline-variant/30 space-y-3">
                      <div className="w-8 h-8 border-4 border-cebu-blue border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-on-surface-variant font-medium">Finding the best ways across Cebu…</p>
                    </div>
                  ) : routingError ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-error-container/10 rounded-2xl border border-error/20 space-y-2 text-center">
                      <span className="material-symbols-outlined text-error text-3xl">error</span>
                      <p className="text-sm text-error font-semibold">{routingError}</p>
                      <p className="text-xs text-on-surface-variant">Showing saved routes for now.</p>
                      <button onClick={fetchRoutes} className="mt-2 text-sm font-semibold text-cebu-blue hover:underline">Try again</button>
                    </div>
                  ) : routes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-surface-container-low rounded-2xl border border-outline-variant/30 text-center">
                      <span className="material-symbols-outlined text-outline text-3xl">sentiment_dissatisfied</span>
                      <p className="text-sm text-on-surface-variant font-semibold mt-2">No routes found.</p>
                      <p className="text-xs text-outline mt-1">Try a different start or destination.</p>
                    </div>
                  ) : (
                    routes.map((route, idx) => (
                      <div key={idx} style={{ order: idx * 2 }}>
                        <RouteCard
                          route={route}
                          passengerType={passengerType}
                          isSelected={selectedRouteIdx === idx}
                          onClick={() => setSelectedRouteIdx(idx)}
                          onStartNavigation={() => setIsNavDrawerOpen(true)}
                        />
                      </div>
                    ))
                  )}
                </div>
              </section>
          </div>

          {/* TAB 2: RUSH HOUR TRAFFIC ANALYTICS */}
          <div className={currentTab === "rush" ? "space-y-6 animate-[fadeIn_0.3s_ease-out]" : "hidden"}>
              <section className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 flex flex-col items-center text-center">
                <span className="text-sm font-semibold text-on-surface-variant mb-4">
                  Traffic right now
                </span>
 
                <div className="relative w-full max-w-[256px] sm:max-w-[280px] h-[128px] sm:h-[140px] overflow-hidden mb-4">
                  {/* Arc ring using conic-gradient */}
                  <div 
                    className="w-full aspect-square rounded-full"
                    style={{
                      background: "conic-gradient(from 180deg at 50% 100%, var(--color-safe-green) 0deg, var(--color-alert-amber) 90deg, var(--color-error) 180deg)",
                      mask: "radial-gradient(circle at 50% 100%, transparent 60%, black 61%)",
                      WebkitMask: "radial-gradient(circle at 50% 100%, transparent 60%, black 61%)",
                    }}
                  />
                  {/* Gauge Needle Pointer */}
                  <div 
                    className="absolute bottom-0 left-1/2 w-1.5 h-[80%] bg-on-surface origin-bottom rounded-full transition-transform duration-700 ease-out"
                    style={{
                      transform: `translateX(-50%) rotate(${gaugeRotate}deg)`
                    }}
                  />
                </div>
 
                <div className="flex flex-col items-center">
                  <span className={`text-2xl font-bold ${isSafetyModeActive ? "text-safe-green" : "text-clay"}`}>
                    {isSafetyModeActive ? "Flowing well" : "Heavy traffic"}
                  </span>
                  <p className="text-sm text-on-surface-variant max-w-sm mt-1.5 leading-relaxed">
                    Daghang tao karon — expect delays along Ramos St and Capitol Site from the Sinulog rehearsals.
                  </p>
                </div>
              </section>
 
              {/* Peak hours chart */}
              <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-on-surface">
                    Busiest hours
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <span className="w-1.5 h-1.5 rounded-full bg-clay" />
                    <span>Today</span>
                  </div>
                </div>
 
                <div className="flex items-end justify-between gap-1.5 sm:gap-3 h-44 pt-6 border-b border-outline-variant/30">
                  {[
                    { label: "4 AM", height: "h-[20%]", volume: "20%", rush: false },
                    { label: "7 AM", height: "h-[75%]", volume: "75%", rush: true },
                    { label: "9 AM", height: "h-[50%]", volume: "50%", rush: false },
                    { label: "12 PM", height: "h-[60%]", volume: "60%", rush: true },
                    { label: "3 PM", height: "h-[45%]", volume: "45%", rush: false },
                    { label: "5 PM", height: "h-full", volume: "95%", rush: true },
                    { label: "8 PM", height: "h-[80%]", volume: "80%", rush: true },
                    { label: "11 PM", height: "h-[25%]", volume: "25%", rush: false },
                  ].map((bar, idx) => {
                    const isSelected = selectedHourBar === idx;
                    return (
                      <div 
                        key={idx}
                        onClick={() => setSelectedHourBar(idx)}
                        className="flex-1 flex flex-col items-center cursor-pointer group"
                      >
                        {/* Bar Segment */}
                        <div 
                          className={`
                            w-full rounded-t-lg transition-all duration-300
                            ${bar.rush ? "bg-alert-amber/70 hover:bg-alert-amber" : "bg-surface-container-highest/60 hover:bg-surface-container-highest"}
                            ${isSelected ? "ring-2 ring-cebu-blue ring-offset-2 scale-102" : ""}
                            ${bar.height}
                          `}
                        >
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-on-surface text-white text-[9px] font-bold rounded px-1.5 py-0.5 absolute -translate-y-8 select-none">
                            {bar.volume}
                          </div>
                        </div>
                        <span className="text-[10px] text-on-surface-variant mt-2 font-medium">
                          {bar.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Dynamic detail depending on clicked bar */}
                <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/40 flex items-center gap-2">
                  <span className="material-symbols-outlined text-cebu-blue text-base">info</span>
                  <span className="text-sm text-on-surface">
                    {selectedHourBar !== null
                      ? selectedHourBar === 5 ? "5 PM is the worst — jeepneys run packed (about 95% full)." : "Tap any bar to see how busy that hour gets."
                      : "Tap any bar to see how busy that hour gets."}
                  </span>
                </div>
              </section>

              {/* Best Times Grid & Safety Mode Toggle */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Best Times Card */}
                <section className="bg-surface-container-low border border-outline-variant rounded-2xl p-5 space-y-3">
                  <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-safe-green">schedule</span>
                    Best times to travel
                  </h3>
                  <div className="space-y-3">
                    {[
                      { time: "10:00 AM – 11:30 AM", desc: "Low traffic, e-jeeps fully available", badge: "FAST", color: "text-safe-green bg-safe-green/10" },
                      { time: "1:30 PM – 3:30 PM", desc: "Optimal window for trans-city trips", badge: "FAST", color: "text-safe-green bg-safe-green/10" },
                      { time: "Post-9:00 PM", desc: "Open lanes. Active Safety Mode recommended", badge: "SECURE", color: "text-aircon-cyan bg-aircon-cyan/10" }
                    ].map((slot, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-surface-container-lowest border border-outline-variant/30 rounded-xl">
                        <div>
                          <p className="text-xs font-bold text-on-surface">{slot.time}</p>
                          <p className="text-[10px] text-on-surface-variant mt-0.5">{slot.desc}</p>
                        </div>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${slot.color}`}>
                          {slot.badge}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Safety Mode Toggle Card */}
                <section className="relative overflow-hidden bg-primary text-on-primary border border-outline-variant rounded-2xl p-6 flex flex-col justify-between">
                  <div className="z-10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-alert-amber text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                          shield_with_heart
                        </span>
                        <h3 className="text-base font-bold">Late-night safety mode</h3>
                      </span>
                      {/* Interactive Switch */}
                      <button 
                        onClick={() => setIsSafetyModeActive(!isSafetyModeActive)}
                        className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-colors ${isSafetyModeActive ? "bg-aircon-cyan" : "bg-outline-variant/50"}`}
                      >
                        <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${isSafetyModeActive ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </div>

                    <p className="text-sm leading-relaxed text-on-primary/90">
                      Heading home after 10 PM? We'll favor well-lit, modern routes with CCTV and GPS-tracked vehicles.
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="bg-on-primary/10 text-on-primary text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 border border-on-primary/10">
                        <span className="material-symbols-outlined text-[10px]">videocam</span> CCTV Monitored
                      </span>
                      <span className="bg-on-primary/10 text-on-primary text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 border border-on-primary/10">
                        <span className="material-symbols-outlined text-[10px]">gps_fixed</span> GPS Tracked
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <button 
                      onClick={() => setIsSafetyModeActive(!isSafetyModeActive)}
                      className={`
                        w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-98
                        ${isSafetyModeActive ? "bg-aircon-cyan text-white dark:text-on-primary-fixed shadow-xs" : "bg-white text-primary dark:text-on-primary-fixed-variant hover:bg-zinc-100 shadow-sm"}
                      `}
                    >
                      {isSafetyModeActive ? "Deactivate Safety Mode" : "Activate Safety Mode"}
                    </button>
                  </div>
                </section>
              </div>

              {/* capitol site alert card */}
              <section className="bg-surface-container-low border border-outline-variant rounded-2xl overflow-hidden">
                <div className="p-4 bg-clay/10 border-b border-outline-variant/40 flex items-center gap-2">
                  <span className="material-symbols-outlined text-clay text-lg">construction</span>
                  <span className="text-sm font-bold text-on-surface">Roadwork at Capitol Site</span>
                </div>
                <div className="p-4">
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Drainage repairs near Capitol Site are adding 15–20 min to the <span className="font-semibold text-on-surface">04L</span> and <span className="font-semibold text-on-surface">17B</span> jeepney lines. Routes here are detoured around it.
                  </p>
                </div>
              </section>
          </div>

          {/* TAB 3: CONVERSATIONAL AI TRANSIT GUIDE */}
          <div className={currentTab === "chat" ? "flex flex-col bg-surface-container-lowest border border-outline-variant rounded-2xl h-[560px] overflow-hidden animate-[fadeIn_0.3s_ease-out]" : "hidden"}>

              {/* Chat Thread Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* Initial Welcome prompt */}
                <div className="flex flex-col items-center text-center py-6 border-b border-outline-variant/30">
                  <div className="w-12 h-12 bg-cebu-blue/10 rounded-full flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-cebu-blue text-2xl">forum</span>
                  </div>
                  <h3 className="text-base font-bold text-on-surface">Ask SugboWay</h3>
                  <p className="text-sm text-on-surface-variant mt-0.5">
                    Fares, routes, and traffic — in English or Bisaya
                  </p>
                </div>

                {chatMessages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"} w-full space-y-1`}
                  >
                    <div className="flex gap-2 max-w-[85%] items-start">
                      {msg.sender === "ai" && (
                        <div className="w-7 h-7 bg-cebu-blue/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-cebu-blue text-sm">forum</span>
                        </div>
                      )}
                      
                      <div 
                        className={`
                          p-3.5 rounded-2xl text-sm leading-relaxed shadow-2xs border
                          ${
                            msg.sender === "user" 
                              ? "bg-cebu-blue text-white border-cebu-blue/20 rounded-tr-none" 
                              : "bg-surface-container-low text-on-surface border-outline-variant/40 rounded-tl-none"
                          }
                        `}
                      >
                        <p>{msg.text}</p>
                        {msg.cebuanoText && (
                          <p className="border-t border-outline-variant/20 pt-2 mt-2 text-xs text-on-surface-variant italic">
                            "{msg.cebuanoText}"
                          </p>
                        )}
                      </div>
                    </div>
 
                    {/* Inline Suggested Stop Map Widget */}
                    {msg.suggestedStop && (
                      <div className="ml-9 max-w-[80%] border border-outline-variant rounded-xl overflow-hidden shadow-2xs bg-surface-container-low mt-2">
                        <div className="p-3 flex justify-between items-center gap-4">
                          <div>
                            <span className="text-xs font-medium text-on-surface-variant block">Suggested stop</span>
                            <h4 className="text-xs font-bold text-on-surface">{msg.suggestedStop.name}</h4>
                            <span className="text-[10px] text-on-surface-variant">{msg.suggestedStop.walkTime}</span>
                          </div>
                          <button 
                            onClick={() => setCurrentTab("map")}
                            className="bg-cebu-blue hover:bg-primary text-white text-[10px] font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                          >
                            Get Directions
                          </button>
                        </div>
                      </div>
                    )}
 
                    <span className={`text-[9px] text-outline px-1 ${msg.sender === "user" ? "mr-1" : "ml-9"}`}>
                      {msg.timestamp}
                    </span>
                  </div>
                ))}
 
                {isAiLoading && (
                  <div className="flex gap-2 max-w-[85%] items-start animate-[fadeIn_0.2s_ease-out]">
                    <div className="w-7 h-7 bg-cebu-blue/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-cebu-blue text-sm">forum</span>
                    </div>
                    <div className="p-3.5 rounded-2xl rounded-tl-none bg-surface-container-low text-on-surface border border-outline-variant/40 shadow-2xs">
                      <div className="flex space-x-1.5 items-center py-1">
                        <div className="w-1.5 h-1.5 bg-on-surface-variant/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-on-surface-variant/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-on-surface-variant/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>
 
              {/* Interactive bottom quick action prompt chips */}
              <div className="px-4 py-2 border-t border-outline-variant/20 bg-surface-container-low/50">
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {[
                    "How much is the fare?",
                    "Is it rush hour now?",
                    "Safe routes tonight?"
                  ].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleQuickQuestion(chip)}
                      className="shrink-0 bg-surface-container-lowest hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant text-[10px] font-bold px-3 py-1.5 rounded-full transition-all active:scale-95"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
 
              {/* Chat Input Field Container */}
              <form 
                onSubmit={handleSendMessage}
                className="p-3 border-t border-outline-variant/40 bg-surface flex items-center gap-2 theme-transition"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask anything about getting around…"
                  className="flex-1 bg-surface-container-low rounded-full px-4 py-3 border border-outline-variant focus:outline-none focus:ring-1 focus:ring-cebu-blue text-sm text-on-surface"
                />
                <button 
                  type="submit"
                  className="w-10 h-10 rounded-full bg-cebu-blue hover:bg-primary text-white flex items-center justify-center shrink-0 transition-transform active:scale-90 shadow-sm"
                >
                  <span className="material-symbols-outlined text-lg">send</span>
                </button>
              </form>
          </div>

          {/* TAB 4: PROFILE & EMERGENCY HUB */}
          <div className={currentTab === "profile" ? "space-y-6 animate-[fadeIn_0.3s_ease-out]" : "hidden"}>
              
              {/* Profile Card */}
              <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-cebu-blue/10 flex items-center justify-center text-cebu-blue shrink-0">
                  <span className="material-symbols-outlined text-3xl">account_circle</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface">Sugbo Commuter</h3>
                  <p className="text-sm text-on-surface-variant mt-0.5 capitalize">{passengerType} fare</p>
                </div>
              </section>

              {/* SugboWay Premium Subscription Card */}
              <section className="bg-surface-container-lowest border border-clay/40 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-clay">star</span>
                      SugboWay Premium
                    </h3>
                    <p className="text-sm text-on-surface-variant mt-1.5 leading-relaxed">
                      Unlimited questions, offline maps you can save, and earlier heads-up on crowded routes.
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${isPremiumUser ? "bg-safe-green/10 text-safe-green" : "bg-surface-container-high text-on-surface-variant"}`}>
                    {isPremiumUser ? "Active" : "Free"}
                  </span>
                </div>

                <div className="bg-surface-container border border-outline-variant/40 rounded-xl p-4 flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-xs text-on-surface-variant">Questions left this hour</span>
                    <span className="text-base font-bold text-on-surface mt-0.5">
                      {isPremiumUser ? "Unlimited" : `${remainingQuota} of 5`}
                    </span>
                  </div>

                  {!isPremiumUser && (
                    <button
                      onClick={() => {
                        setIsPremiumUser(true);
                        setRemainingQuota(9999);
                        setIsRateLimited(false);
                      }}
                      className="bg-clay hover:brightness-95 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all active:scale-95"
                    >
                      Upgrade
                    </button>
                  )}
                </div>

                {!isPremiumUser && (
                  <p className="text-xs text-on-surface-variant text-center">
                    ₱49/month — keeps Cebu's community maps running.
                  </p>
                )}
              </section>

              {/* Emergency hotlines */}
              <section className="bg-surface-container-low border border-outline-variant rounded-2xl p-5 space-y-4">
                <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-error">emergency</span>
                  Emergency hotlines
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { name: "City Disaster Office (CCDRRMO)", phone: "(032) 262-1424" },
                    { name: "Traffic Command (CCTO)", phone: "(032) 253-1226" },
                    { name: "LTFRB Region 7", phone: "(032) 231-6221" },
                    { name: "Red Cross Cebu", phone: "(032) 253-9793" }
                  ].map((hotline, i) => (
                    <a
                      key={i}
                      href={`tel:${hotline.phone.replace(/[^0-9]/g, "")}`}
                      className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl p-4 flex justify-between items-center gap-3 hover:border-cebu-blue transition-colors"
                    >
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-on-surface truncate">{hotline.name}</h4>
                        <span className="text-sm text-on-surface-variant tabular-nums mt-0.5 block">{hotline.phone}</span>
                      </div>
                      <span className="material-symbols-outlined text-cebu-blue shrink-0">call</span>
                    </a>
                  ))}
                </div>
              </section>

              {/* Saved stations list */}
              <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 space-y-3">
                <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-clay">bookmark</span>
                  Saved stops
                </h3>
                <div className="space-y-2">
                  {[
                    { name: "Cebu IT Park Terminal", lines: ["04L", "17B", "MyBus"] },
                    { name: "Ayala Center Terminal", lines: ["13C", "17B", "12L"] }
                  ].map((station, i) => (
                    <button key={i} className="w-full text-left p-3 bg-surface-container-low border border-outline-variant/40 rounded-xl flex justify-between items-center gap-3 hover:border-cebu-blue transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{station.name}</p>
                        <div className="flex gap-1.5 mt-1.5">
                          {station.lines.map((ln) => (
                            <span key={ln} className="bg-cebu-blue/10 text-cebu-blue text-xs font-semibold px-1.5 py-0.5 rounded tabular-nums">
                              {ln}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-outline shrink-0">chevron_right</span>
                    </button>
                  ))}
                </div>
              </section>
          </div>

        </div>

        {/* Footer */}
        <footer className="hidden md:block py-4 border-t border-outline-variant/30 text-center text-xs text-on-surface-variant">
          <p>© 2026 SugboWay · Made in Cebu · Fares follow LTFRB rates</p>
        </footer>

        {/* BOTTOM NAVIGATION BAR (Tab selector on Mobile) */}
        <nav className="md:hidden fixed bottom-6 left-4 right-4 z-50 flex justify-around items-center px-4 py-2.5 bg-surface/85 backdrop-blur-md shadow-lg rounded-full border border-outline-variant/30 theme-transition max-w-md mx-auto">
          {[
            { id: "map", label: "Routes", icon: "map" },
            { id: "rush", label: "Traffic", icon: "analytics" },
            { id: "chat", label: "Ask", icon: "forum" },
            { id: "profile", label: "Profile", icon: "person" },
          ].map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id as any)}
                className={`
                  flex flex-col items-center justify-center transition-all duration-300 select-none min-w-[64px] min-h-[48px]
                  ${isActive ? "text-primary font-extrabold scale-105" : "text-on-surface-variant hover:text-on-surface"}
                `}
              >
                {/* Icon wrapper for the pill background */}
                <div className="relative flex items-center justify-center px-5 py-1 rounded-full transition-all duration-300">
                  <div 
                    className={`
                      absolute inset-0 rounded-full -z-10 transition-all duration-300
                      ${isActive ? "bg-primary/15 scale-100 opacity-100" : "bg-transparent scale-50 opacity-0"}
                    `} 
                  />
                  <span className="material-symbols-outlined text-xl transition-transform duration-300" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                    {item.icon}
                  </span>
                </div>
                <span className="text-[10px] font-bold mt-1 tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <NavigationDrawer 
          route={selectedRouteIdx !== null && routes[selectedRouteIdx] ? routes[selectedRouteIdx] : null} 
          passengerType={passengerType} 
          isOpen={isNavDrawerOpen} 
          onClose={() => setIsNavDrawerOpen(false)} 
        />

        {isApproaching && (
          <ProximityAlert
            distanceToStop={distanceToStop}
            nextStopName={nextStopName}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            onDismiss={dismissAlert}
          />
        )}

        {/* Premium Upgrade Modal when Rate Limited */}
        {isRateLimited && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-surface-container-high border border-outline-variant shadow-2xl rounded-2xl p-6 max-w-sm w-full space-y-4 animate-[scaleUp_0.3s_ease-out] text-center">
              <div className="w-14 h-14 bg-clay/10 rounded-full flex items-center justify-center mx-auto text-clay">
                <span className="material-symbols-outlined text-3xl">star</span>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-on-surface">That's your 5 free questions</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  You've used your free questions for this hour. Go Premium for unlimited questions and offline maps.
                </p>
              </div>

              <div className="bg-surface-container-highest border border-outline-variant/40 rounded-xl py-2.5 px-3.5 text-sm text-on-surface-variant flex justify-between items-center">
                <span>Free again in</span>
                <span className="font-semibold text-on-surface tabular-nums">
                  {rateLimitResetSeconds > 60
                    ? `~${Math.ceil(rateLimitResetSeconds / 60)} min`
                    : `~${rateLimitResetSeconds}s`}
                </span>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => {
                    setIsPremiumUser(true);
                    setRemainingQuota(9999);
                    setIsRateLimited(false);
                  }}
                  className="w-full bg-clay hover:brightness-95 text-white font-semibold text-sm py-3 rounded-xl transition-all active:scale-95"
                >
                  Go Premium · ₱49/mo
                </button>
                <button
                  onClick={() => setIsRateLimited(false)}
                  className="w-full bg-surface-container-highest hover:bg-on-surface/5 text-on-surface text-sm py-2.5 rounded-xl transition-all font-medium"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
