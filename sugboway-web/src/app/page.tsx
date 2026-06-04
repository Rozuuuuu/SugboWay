"use client";

import React, { useState, useEffect, useRef } from "react";
import type { RouteResult, PassengerType, RouteLeg } from "@/domain";
import RouteCard from "@/components/route/RouteCard";
import RouteCodeBadge from "@/components/route/RouteCodeBadge";
import NavigationDrawer from "@/components/route/NavigationDrawer";
import ProximityAlert from "@/components/route/ProximityAlert";
import { calculateFare, formatPHP } from "@/domain";
import maplibregl from "maplibre-gl";
import type { Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { useOfflineMap } from "@/hooks/useOfflineMap";
import { useProximityEtiquette } from "@/hooks/useProximityEtiquette";

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
        routeId: "13C",
        routeShortName: "13C",
        route: {
          routeId: "13C",
          routeShortName: "13C",
          routeLongName: "Talamban - Colon via Ramos",
          routeType: "modern_ejeep",
          agencyId: "LTFRB-R7",
          isModernized: true,
          hasAircon: true,
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
        routeId: "17B",
        routeShortName: "17B",
        route: {
          routeId: "17B",
          routeShortName: "17B",
          routeLongName: "Apas - Colon via Ramos",
          routeType: "jeepney",
          agencyId: "LTFRB-R7",
          isModernized: false,
          hasAircon: false,
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
        routeId: "04L",
        routeShortName: "04L",
        route: {
          routeId: "04L",
          routeShortName: "04L",
          routeLongName: "Lahug - IT Park via SM",
          routeType: "jeepney",
          agencyId: "LTFRB-R7",
          isModernized: false,
          hasAircon: false,
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
        routeId: "mybus_srp",
        routeShortName: "MyBus",
        route: {
          routeId: "mybus_srp",
          routeShortName: "MyBus",
          routeLongName: "SM Seaside - Ayala Center Cebu via SRP",
          routeType: "mybus",
          agencyId: "Metro-Express",
          isModernized: true,
          hasAircon: true,
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

const ROUTING_API_URL = process.env.NEXT_PUBLIC_ROUTING_API_URL || "http://localhost:8080";
const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || "http://localhost:8000";

export default function DemoPage() {
  const { isOffline, mapStyle } = useOfflineMap();

  // Shared States
  const [currentTab, setCurrentTab] = useState<"map" | "rush" | "chat" | "profile">("map");
  const [passengerType, setPassengerType] = useState<PassengerType>("regular");
  const [isSafetyModeActive, setIsSafetyModeActive] = useState(false);
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Auto-trigger Late-Night Safety Mode if local time is past 9 PM (21:00) or before 5 AM
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 21 || hour < 5) {
      setIsSafetyModeActive(true);
    }
  }, []);

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

  // Fetch optimal routes from Go Fiber Routing Engine
  const fetchRoutes = async () => {
    setIsRoutingLoading(true);
    setRoutingError(null);
    try {
      const originCoords = resolveLocation(origin, { lat: 10.3662, lon: 123.9169 });
      const destCoords = resolveLocation(destination, { lat: 10.2974, lon: 123.8997 });

      const url = `${ROUTING_API_URL}/api/v1/route/search?origin_lat=${originCoords.lat}&origin_lon=${originCoords.lon}&dest_lat=${destCoords.lat}&dest_lon=${destCoords.lon}&passenger_type=${passengerType}&accessible=${isSafetyModeActive}`;
      
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Routing request failed: ${res.statusText}`);
      }
      const data = await res.json();
      
      if (Array.isArray(data)) {
        // Fetch real-time BPR congestion metrics for each route's legs
        const enrichedRoutes = await Promise.all(data.map(async (route: RouteResult) => {
          let maxCrowding = 0.25; // Default safe level
          
          const enrichedLegs = await Promise.all(route.legs.map(async (leg: RouteLeg) => {
            if (leg.type === "transit" && leg.routeId) {
              try {
                const congRes = await fetch(`${ROUTING_API_URL}/api/v1/congestion?route_id=${leg.routeId}`);
                if (congRes.ok) {
                  const congData = await congRes.json();
                  const flowRatio = congData.flow_ratio ?? 0.25;
                  
                  // Map flow ratio and multipliers correctly to score
                  let score = flowRatio;
                  if (congData.is_peak) {
                    // Apply peak window loading adjustments
                    score = Math.min(score * 1.2, 1.0);
                  }
                  
                  leg.fromStop.crowdingScore = score;
                  leg.toStop.crowdingScore = score;
                  if (score > maxCrowding) {
                    maxCrowding = score;
                  }
                }
              } catch (e) {
                // Fail silently and use fallback
              }
            }
            return leg;
          }));

          return {
            ...route,
            legs: enrichedLegs,
            crowdingWorstLeg: maxCrowding,
          };
        }));

        setRoutes(enrichedRoutes);
        if (enrichedRoutes.length > 0) {
          setSelectedRouteIdx(0);
        }
      } else {
        throw new Error("Invalid response format from routing engine");
      }
    } catch (err: any) {
      setRoutes([]);
      setRoutingError(err.message || "Failed to connect to the spatial routing engine.");
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

    mapRef.current = map;

    return () => {
      map.remove();
    };
  }, []);

  // Update map style when switching between online/offline modes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mapStyle);
  }, [mapStyle]);

  // Update Route Polyline and Markers on Selected Route index change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawOnMap = async () => {
      // Clean up previous route layer
      if (map.getLayer("route-line")) {
        map.removeLayer("route-line");
      }
      if (map.getSource("route-source")) {
        map.removeSource("route-source");
      }

      // Clean up previous markers
      const markers = document.querySelectorAll(".maplibregl-marker");
      markers.forEach((m) => m.remove());

      if (selectedRouteIdx === null) return;
      const selectedRoute = routes[selectedRouteIdx];
      if (!selectedRoute) return;

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

      const geoJson = { type: "FeatureCollection", features: shapeFeatures };

      // Draw route polyline
      map.addSource("route-source", {
        type: "geojson",
        data: geoJson as any,
      });

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route-source",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#0056B3", // Cebu Blue
          "line-width": 6,
          "line-opacity": 0.85,
        },
      });

      // Add Start/End stop markers color-coded based on crowding score
      selectedRoute.legs.forEach((leg) => {
        // Boarding stop
        const elFrom = document.createElement("div");
        const crowdScore = leg.fromStop.crowdingScore ?? 0.22;
        const colorClass = crowdScore > 0.8 ? "bg-error" : crowdScore > 0.5 ? "bg-alert-amber" : "bg-safe-green";
        elFrom.className = `w-4 h-4 rounded-full border-2 border-white shadow-md ${colorClass}`;
        new maplibregl.Marker(elFrom)
          .setLngLat([leg.fromStop.location.lon, leg.fromStop.location.lat])
          .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(`<h6><b>${leg.fromStop.stopName}</b></h6><p>Crowding: ${Math.round(crowdScore * 100)}%</p>`))
          .addTo(map);

        // Alighting stop
        const elTo = document.createElement("div");
        const toCrowdScore = leg.toStop.crowdingScore ?? 0.22;
        const toColorClass = toCrowdScore > 0.8 ? "bg-error" : toCrowdScore > 0.5 ? "bg-alert-amber" : "bg-safe-green";
        elTo.className = `w-4 h-4 rounded-full border-2 border-white shadow-md ${toColorClass}`;
        new maplibregl.Marker(elTo)
          .setLngLat([leg.toStop.location.lon, leg.toStop.location.lat])
          .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(`<h6><b>${leg.toStop.stopName}</b></h6><p>Crowding: ${Math.round(toCrowdScore * 100)}%</p>`))
          .addTo(map);
      });

      // Render intermediate stop markers from fetched per-route stops
      stopResults.forEach((result) => {
        if (result.status === "fulfilled" && result.value?.stops) {
          const routeStops = result.value.stops || [];
          routeStops.forEach((stop: any) => {
            const el = document.createElement("div");
            el.className = "w-3 h-3 rounded-full bg-cebu-blue/60 border border-white shadow-sm";
            new maplibregl.Marker(el)
              .setLngLat([stop.location.lon, stop.location.lat])
              .setPopup(new maplibregl.Popup({ offset: 8 }).setHTML(`<b>${stop.stopName}</b>`))
              .addTo(map);
          });
        }
      });

      // Snaps bounds of the map to the geometry line
      try {
        const coords: [number, number][] = [];
        geoJson.features.forEach((feat) => {
          if (feat.geometry.type === "LineString") {
            const c = feat.geometry.coordinates as [number, number][];
            coords.push(...c);
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
              text: `⚠️ **Rate Limit Exceeded:** You have reached the maximum allowance of **5 free AI queries per hour**. Please upgrade to **SugboWay Premium** to unlock unlimited transit planning!`,
              cebuanoText: "⚠️ Nakaabot na ka sa limit nga 5 ka AI chat matag oras. Palihug pag-upgrade sa Premium!",
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
      
      {/* Responsive Desktop Sidebar (WOW Design Element) */}
      <aside className="hidden md:flex flex-col w-64 bg-surface border-r border-outline-variant p-4 space-y-6">
        <div className="flex items-center gap-3 py-2 border-b border-outline-variant/30">
          <span className="material-symbols-outlined text-cebu-blue text-3xl font-bold">directions_transit</span>
          <div className="flex flex-col">
            <h1 className="text-md font-extrabold text-cebu-blue tracking-wider uppercase">SugboWay</h1>
            <span className="text-[10px] text-outline uppercase tracking-widest font-semibold">Cebu Guide</span>
          </div>
        </div>

        {/* Sidebar Nav Buttons */}
        <nav className="flex-1 space-y-1">
          {[
            { id: "map", label: "Map Finder", icon: "map" },
            { id: "rush", label: "Rush Hour", icon: "analytics" },
            { id: "chat", label: "AI Guide", icon: "smart_toy" },
            { id: "profile", label: "Profile", icon: "person" },
          ].map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id as any)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold
                  transition-all duration-200 select-none
                  ${
                    isActive
                      ? "bg-secondary-container text-on-secondary-container shadow-xs scale-102"
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  }
                `}
              >
                <span className="material-symbols-outlined text-xl">
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Brand Footer */}
        <div className="pt-4 border-t border-outline-variant/30 text-[10px] text-outline italic">
          <p>SugboWay Cebu Refactor v1.4</p>
          <p>© 2026 Transit Board</p>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-h-screen">
        
        {/* Top AppBar */}
        <header className="sticky top-0 z-40 flex justify-between items-center px-4 h-14 bg-surface shadow-sm border-b border-outline-variant md:shadow-none">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-2 hover:bg-surface-container transition-colors rounded-full text-cebu-blue">
              <span className="material-symbols-outlined font-bold">directions_transit</span>
            </button>
            <h1 className="md:hidden text-lg font-extrabold text-cebu-blue uppercase tracking-wider">
              SugboWay
            </h1>
            <span className="bg-primary/10 text-primary text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase border border-primary/20 tracking-wider">
              {currentTab === "map" && "Map & Routes"}
              {currentTab === "rush" && "Rush Hour Tracker"}
              {currentTab === "chat" && "AI Transit Assistant"}
              {currentTab === "profile" && "User Settings"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Status Indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-high rounded-full border border-outline-variant/30 text-xs font-semibold text-on-surface-variant">
              <span className={`w-2 h-2 rounded-full ${isSafetyModeActive ? "bg-aircon-cyan animate-pulse" : "bg-safe-green"}`} />
              <span>{isSafetyModeActive ? "Safety Mode Active" : "GPS Online"}</span>
            </div>
            <button className="p-2 hover:bg-surface-container transition-colors rounded-full text-cebu-blue">
              <span className="material-symbols-outlined">account_circle</span>
            </button>
          </div>
        </header>

        {/* Tab Specific Content Area */}
        <div className="flex-1 p-4 md:py-6 max-w-4xl w-full mx-auto pb-24 md:pb-6 space-y-6">
          
          {/* TAB 1: MAP FINDER */}
          {currentTab === "map" && (
            <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
              
              {/* Navigation & Search Area */}
              <section className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 shadow-xs space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-outline-variant/30">
                  <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-cebu-blue">route</span>
                    Transit Route Finder
                  </h2>
                  <span className="text-xs text-on-surface-variant italic">
                    LTFRB 2023 Order Compliant
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Origin */}
                  <div className="relative flex items-center bg-surface-container-low rounded-xl px-4 py-2 border border-outline-variant hover:border-cebu-blue transition-colors group">
                    <span className="material-symbols-outlined text-outline group-focus-within:text-cebu-blue shrink-0">
                      my_location
                    </span>
                    <div className="flex-1 flex flex-col ml-3">
                      <label className="text-[10px] font-bold text-outline uppercase tracking-wider">
                        Starting Point
                      </label>
                      <input
                        type="text"
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                        className="bg-transparent border-none p-0 text-sm font-semibold text-on-surface focus:outline-none focus:ring-0 placeholder:text-outline-variant"
                        placeholder="Enter starting location"
                      />
                    </div>
                  </div>

                  {/* Destination */}
                  <div className="relative flex items-center bg-surface-container-low rounded-xl px-4 py-2 border border-outline-variant hover:border-cebu-blue transition-colors group">
                    <span className="material-symbols-outlined text-outline group-focus-within:text-cebu-blue shrink-0">
                      pin_drop
                    </span>
                    <div className="flex-1 flex flex-col ml-3">
                      <label className="text-[10px] font-bold text-outline uppercase tracking-wider">
                        Where to?
                      </label>
                      <input
                        type="text"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        className="bg-transparent border-none p-0 text-sm font-semibold text-on-surface focus:outline-none focus:ring-0 placeholder:text-outline-variant"
                        placeholder="Enter destination"
                      />
                    </div>
                  </div>
                </div>

                {/* Passenger Type Selectors */}
                <div className="pt-2">
                  <span className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">
                    Passenger Classification
                  </span>
                  <div className="flex flex-wrap gap-2">
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
                            flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold
                            transition-all duration-200 select-none
                            ${
                              isSelected
                                ? "bg-cebu-blue text-white shadow-xs scale-102"
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
                    className="w-full bg-cebu-blue hover:bg-primary disabled:bg-cebu-blue/50 text-white font-bold py-3 px-6 rounded-2xl shadow-sm transition-all duration-200 active:scale-98 flex items-center justify-center gap-2 select-none text-xs"
                  >
                    {isRoutingLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Searching Optimal Cebu Routes...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">search</span>
                        <span>Search Cebu Routes</span>
                      </>
                    )}
                  </button>
                </div>
              </section>

              {/* Rush Hour Dashboard (Traffic Forecast) */}
              {isTrafficBannerOpen && (
                <div className="bg-surface-container-low border-l-4 border-alert-amber rounded-2xl p-4 shadow-xs flex gap-3 items-start justify-between">
                  <div className="flex gap-3 items-start">
                    <span className="material-symbols-outlined text-alert-amber text-2xl font-bold mt-0.5 animate-pulse">
                      warning
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-on-surface">Cebu Rush Hour Active</h3>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 bg-alert-amber/20 text-on-tertiary-fixed border border-alert-amber/30 rounded-full">
                          Congested (85%)
                        </span>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-1 max-w-2xl leading-relaxed">
                        Severe bottlenecks detected along **Fuente Circle** and **Colon St**. Commuters taking traditional routes expect up to 25 mins delay. Consider E-Jeepney corridors or late-night Safety Mode options.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsTrafficBannerOpen(false)}
                    className="p-1 hover:bg-surface-container-high rounded-full text-on-surface-variant"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
              )}

              {/* Suggested Routes Listing */}
              <section className="space-y-3">
                <div className="flex justify-between items-center">
                  <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider">
                    Suggested Routes ({routes.length})
                  </h2>
                  <span className="text-xs text-on-surface-variant">
                    Filters: {passengerType.toUpperCase()}
                  </span>
                </div>

                <div className="flex flex-col gap-4">
                  {isRoutingLoading ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-surface-container-low rounded-2xl border border-outline-variant/30 space-y-3">
                      <div className="w-8 h-8 border-4 border-cebu-blue border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-on-surface-variant font-semibold">Loading real-time Dijkstra routes...</p>
                    </div>
                  ) : routingError ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-error-container/10 rounded-2xl border border-error/20 space-y-2 text-center">
                      <span className="material-symbols-outlined text-error text-3xl">error</span>
                      <p className="text-xs text-error font-bold">{routingError}</p>
                      <p className="text-[10px] text-on-surface-variant">Fuzzy snapped locations. Showing offline fallbacks instead.</p>
                      <button onClick={fetchRoutes} className="mt-2 text-xs font-bold text-cebu-blue hover:underline">Retry Connection</button>
                    </div>
                  ) : routes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-surface-container-low rounded-2xl border border-outline-variant/30 text-center">
                      <span className="material-symbols-outlined text-outline text-3xl">sentiment_dissatisfied</span>
                      <p className="text-xs text-on-surface-variant font-bold mt-2">No routes found.</p>
                      <p className="text-[10px] text-outline mt-1">Please try modifying your search inputs.</p>
                    </div>
                  ) : (
                    routes.map((route, idx) => (
                      <RouteCard
                        key={idx}
                        route={route}
                        passengerType={passengerType}
                        isSelected={selectedRouteIdx === idx}
                        onClick={() => setSelectedRouteIdx(idx)}
                        onStartNavigation={() => setIsNavDrawerOpen(true)}
                      />
                    ))
                  )}
                </div>
              </section>

              {/* Dynamic Map Representation */}
              <section className="bg-surface-container-low border border-outline-variant rounded-3xl p-5 space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-outline-variant/30">
                  <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-cebu-blue">map</span>
                    SugboWay Map Canvas (Interactive Preview)
                  </h2>
                  <span className="text-xs text-on-surface-variant italic">
                    MapLibre GL + OpenStreetMap
                  </span>
                </div>

                <div className="relative h-64 rounded-2xl overflow-hidden border border-outline-variant bg-surface-container-highest flex items-center justify-center">
                  {/* Real MapContainer */}
                  <div ref={mapContainerRef} className="absolute inset-0 z-0" />

                  {/* Offline Mode Banner */}
                  {isOffline && (
                    <div className="absolute top-4 left-4 z-20 bg-surface-container-highest/90 backdrop-blur-md border border-amber-500/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg animate-fade-in text-amber-500">
                      <span className="material-symbols-outlined text-sm animate-pulse">cloud_off</span>
                      <span className="text-xs font-bold font-mono">Offline Map Mode</span>
                    </div>
                  )}

                  {/* Pulsing ChatFAB Floating Voice/AI Button in Map Corner (WOW Element) */}
                  <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
                    <button 
                      onClick={() => {
                        setIsRecording(true);
                        setTimeout(() => {
                          setIsRecording(false);
                          setCurrentTab("chat");
                          handleQuickQuestion("pila plete padong colon?");
                        }, 3000); // 3 seconds mock Whisper recording
                      }}
                      className={`
                        w-12 h-12 rounded-full bg-error hover:bg-red-700 text-white flex items-center justify-center shadow-lg transition-all duration-300 relative select-none
                        ${isRecording ? "scale-110 bg-red-800" : "hover:scale-105 active:scale-95"}
                      `}
                      title="Speak to Whisper AI Guide"
                    >
                      {isRecording ? (
                        <span className="material-symbols-outlined text-xl animate-spin">graphic_eq</span>
                      ) : (
                        <span className="material-symbols-outlined text-xl">mic</span>
                      )}
                      {/* Pulse waves */}
                      {isRecording && (
                        <span className="absolute inset-0 w-full h-full rounded-full border-4 border-error/50 animate-ping" />
                      )}
                    </button>
                    
                    <button 
                      onClick={() => setCurrentTab("chat")}
                      className="w-12 h-12 rounded-full bg-cebu-blue hover:bg-primary text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 select-none"
                      title="Open AI Commuter Guide"
                    >
                      <span className="material-symbols-outlined text-xl">smart_toy</span>
                    </button>
                  </div>

                  {/* Glassmorphism Over-Map Control */}
                  <div className="absolute bottom-4 left-4 right-4 bg-surface-container-lowest/80 backdrop-blur-md border border-outline-variant rounded-xl p-3 flex justify-between items-center z-10 shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-cebu-blue">directions_bus</span>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-on-surface">
                          {selectedRouteIdx !== null && routes[selectedRouteIdx] ? `Selected Option: Route ${routes[selectedRouteIdx].legs[0]?.routeShortName || "Walk"}` : "Select a Route above"}
                        </span>
                        <span className="text-[10px] text-on-surface-variant">
                          {selectedRouteIdx !== null && routes[selectedRouteIdx] ? `${formatDuration(routes[selectedRouteIdx].totalTimeSeconds)} total duration` : "Click on a card to preview"}
                        </span>
                      </div>
                    </div>

                    <button 
                      onClick={() => setCurrentTab("chat")}
                      className="bg-cebu-blue hover:bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 active:scale-95 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-xs">navigation</span>
                      Ask AI Guide
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: RUSH HOUR TRAFFIC ANALYTICS */}
          {currentTab === "rush" && (
            <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
              
              {/* Traffic Density Needle Gauge (WOW Component) */}
              <section className="bg-surface-container-low border border-outline-variant rounded-3xl p-6 flex flex-col items-center text-center shadow-xs">
                <span className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest mb-4">
                  Cebu Traffic Volume Gauge
                </span>

                <div className="relative w-64 h-32 overflow-hidden mb-4">
                  {/* Arc ring using conic-gradient */}
                  <div 
                    className="w-64 h-64 rounded-full"
                    style={{
                      background: "conic-gradient(from 180deg at 50% 100%, #2e7d32 0deg, #ffbf00 90deg, #ba1a1a 180deg)",
                      mask: "radial-gradient(circle at 50% 100%, transparent 60%, black 61%)",
                      WebkitMask: "radial-gradient(circle at 50% 100%, transparent 60%, black 61%)",
                    }}
                  />
                  {/* Gauge Needle Pointer */}
                  <div 
                    className="absolute bottom-0 left-1/2 w-1.5 h-24 bg-on-surface origin-bottom rounded-full transition-transform duration-700 ease-out"
                    style={{
                      transform: `translateX(-50%) rotate(${gaugeRotate}deg)`
                    }}
                  />
                </div>

                <div className="flex flex-col items-center">
                  <span className={`text-2xl font-extrabold ${isSafetyModeActive ? "text-safe-green" : "text-error animate-pulse"}`}>
                    {isSafetyModeActive ? "Moderate-Flow" : "High-Density Rush"}
                  </span>
                  <p className="text-xs text-on-surface-variant max-w-sm mt-1 italic leading-relaxed">
                    "Daghang taw karon. Extreme travel delays along Ramos St and Capitol Site due to Sinulog traffic rehearsals."
                  </p>
                </div>
              </section>

              {/* Crowd Meter Analytics Chart (WOW Interactive Element) */}
              <section className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 shadow-xs space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-cebu-blue">bar_chart</span>
                    Peak Commuting Hours (Cebu Calibrated)
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span className="w-2.5 h-2.5 rounded-full bg-alert-amber animate-pulse" />
                    <span>Real-Time Forecast</span>
                  </div>
                </div>

                <div className="flex items-end justify-between gap-2.5 h-44 pt-6 border-b border-outline-variant/30">
                  {[
                    { label: "4 AM", height: "h-1/5", volume: "20%", rush: false },
                    { label: "7 AM", height: "h-3/4", volume: "75%", rush: true },
                    { label: "9 AM", height: "h-2/4", volume: "50%", rush: false },
                    { label: "12 PM", height: "h-3/5", volume: "60%", rush: true },
                    { label: "3 PM", height: "h-2/4", volume: "45%", rush: false },
                    { label: "5 PM", height: "h-full", volume: "95%", rush: true },
                    { label: "8 PM", height: "h-4/5", volume: "80%", rush: true },
                    { label: "11 PM", height: "h-1/4", volume: "25%", rush: false },
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
                            ${bar.rush ? "bg-alert-amber/70 hover:bg-alert-amber" : "bg-outline-variant/50 hover:bg-outline-variant"}
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
                <div className="bg-surface-container-low rounded-xl p-3 border border-outline-variant/20 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-cebu-blue text-sm">info</span>
                    <span className="text-xs font-semibold text-on-surface">
                      {selectedHourBar !== null 
                        ? `Selected Period: ${selectedHourBar === 5 ? "5 PM (Peak Rush Hour - 95% capacity)" : "Active congestion tracking active"}`
                        : "Click a bar above to view detailed statistics"}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-outline">BPR Math Engine</span>
                </div>
              </section>

              {/* Best Times Grid & Safety Mode Toggle */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Best Times Card */}
                <section className="bg-surface-container-low border border-outline-variant rounded-3xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-safe-green">schedule</span>
                    Best Travel Times
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
                <section className="relative overflow-hidden bg-primary text-white border border-outline-variant rounded-3xl p-6 flex flex-col justify-between shadow-xs">
                  <div className="z-10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-alert-amber text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                          shield_with_heart
                        </span>
                        <h3 className="text-sm font-bold">Late-Night Safety Mode</h3>
                      </span>
                      {/* Interactive Switch */}
                      <button 
                        onClick={() => setIsSafetyModeActive(!isSafetyModeActive)}
                        className={`w-10 h-6 flex items-center rounded-full p-0.5 transition-colors ${isSafetyModeActive ? "bg-aircon-cyan" : "bg-outline-variant/50"}`}
                      >
                        <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${isSafetyModeActive ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </div>

                    <p className="text-xs opacity-90 leading-relaxed">
                      Commuting after 10 PM? Safety Mode filters routing results to prefer modernized corridors featuring on-board CCTVs and live GPS trackers.
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="bg-white/10 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[10px]">videocam</span> CCTV Monitored
                      </span>
                      <span className="bg-white/10 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[10px]">gps_fixed</span> GPS Tracked
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <button 
                      onClick={() => setIsSafetyModeActive(!isSafetyModeActive)}
                      className={`
                        w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-98
                        ${isSafetyModeActive ? "bg-aircon-cyan text-white shadow-xs" : "bg-white text-primary hover:bg-zinc-100 shadow-sm"}
                      `}
                    >
                      {isSafetyModeActive ? "Deactivate Safety Mode" : "Activate Safety Mode"}
                    </button>
                  </div>

                  {/* Decorative background glow */}
                  <div className="absolute -right-12 -bottom-12 w-32 h-32 bg-primary-container opacity-20 rounded-full blur-3xl" />
                </section>
              </div>

              {/* capitol site alert card */}
              <section className="bg-surface-container-low border border-outline-variant rounded-3xl overflow-hidden shadow-xs">
                <div className="p-4 bg-error-container/10 border-b border-outline-variant/30 flex items-center gap-2">
                  <span className="material-symbols-outlined text-error text-lg animate-pulse">warning</span>
                  <span className="text-xs font-bold text-on-error-container">Construction Alert: Capitol Site</span>
                </div>
                <div className="p-4 space-y-2">
                  <h4 className="text-xs font-bold text-on-surface">Jeepney Route Deviation Notice</h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    Road closures for drain rehabilitation near Capitol Site may cause 15-20 min delays for standard traditional lines **04L** and **17B**. Routes are snapped to secondary detours.
                  </p>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: CONVERSATIONAL AI TRANSIT GUIDE */}
          {currentTab === "chat" && (
            <div className="flex flex-col bg-surface-container-lowest border border-outline-variant rounded-3xl h-[560px] overflow-hidden shadow-xs animate-[fadeIn_0.3s_ease-out]">
              
              {/* Chat Thread Container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {/* Initial Welcome prompt */}
                <div className="flex flex-col items-center text-center py-6 border-b border-outline-variant/20 opacity-70">
                  <div className="w-12 h-12 bg-surface-container-high rounded-full flex items-center justify-center mb-2">
                    <span className="material-symbols-outlined text-cebu-blue text-2xl">smart_toy</span>
                  </div>
                  <h3 className="text-sm font-bold text-on-surface">SugboWay Contextual Guide</h3>
                  <p className="text-[10px] text-on-surface-variant italic mt-0.5">
                    Multilingual anti-hallucination transit bot
                  </p>
                </div>

                {chatMessages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"} w-full space-y-1`}
                  >
                    <div className="flex gap-2 max-w-[85%] items-start">
                      {msg.sender === "ai" && (
                        <div className="w-7 h-7 bg-secondary-container rounded-full flex items-center justify-center shrink-0 border border-outline-variant/20 mt-0.5">
                          <span className="material-symbols-outlined text-on-secondary-container text-sm">smart_toy</span>
                        </div>
                      )}
                      
                      <div 
                        className={`
                          p-3.5 rounded-2xl text-xs leading-relaxed shadow-2xs border
                          ${
                            msg.sender === "user" 
                              ? "bg-cebu-blue text-white border-cebu-blue/20 rounded-tr-none" 
                              : "bg-surface-container-low text-on-surface border-outline-variant/40 rounded-tl-none"
                          }
                        `}
                      >
                        <p>{msg.text}</p>
                        {msg.cebuanoText && (
                          <p className="border-t border-outline-variant/20 pt-2 mt-2 text-[10px] text-on-surface-variant italic">
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
                            <span className="text-[9px] font-bold text-outline uppercase tracking-wider block">Suggested Location</span>
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
                    <div className="w-7 h-7 bg-secondary-container rounded-full flex items-center justify-center shrink-0 border border-outline-variant/20 mt-0.5">
                      <span className="material-symbols-outlined text-on-secondary-container text-sm animate-pulse">smart_toy</span>
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
                className="p-3 border-t border-outline-variant/40 bg-surface flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask SugboWay Guide..."
                  className="flex-1 bg-surface-container-low rounded-full px-4 py-2 border border-outline-variant focus:outline-none focus:ring-1 focus:ring-cebu-blue text-xs"
                />
                <button 
                  type="submit"
                  className="w-8 h-8 rounded-full bg-cebu-blue hover:bg-primary text-white flex items-center justify-center transition-transform active:scale-90"
                >
                  <span className="material-symbols-outlined text-sm">send</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: PROFILE & EMERGENCY HUB */}
          {currentTab === "profile" && (
            <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
              
              {/* Profile Card */}
              <section className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 shadow-xs flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary-container flex items-center justify-center text-cebu-blue">
                  <span className="material-symbols-outlined text-3xl">account_circle</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Sugbo Commuter</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">Active transit tier: **{passengerType.toUpperCase()}**</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="bg-safe-green/10 text-safe-green border border-safe-green/20 text-[9px] font-extrabold px-2 py-0.5 rounded-full">
                      LTFRB Verified
                    </span>
                  </div>
                </div>
              </section>

              {/* SugboWay Premium Subscription Card */}
              <section className="bg-gradient-to-tr from-cebu-blue/20 via-surface-container-lowest to-purple-500/20 border border-cebu-blue/40 rounded-3xl p-5 space-y-4 shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 animate-pulse" />
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-extrabold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-500 animate-spin">stars</span>
                      SugboWay Premium Plan
                    </h3>
                    <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
                      Say goodbye to limits. Get unlimited AI route queries, RAG multi-hop scheduling, offline map caching, and priority BPR crowding forecasts!
                    </p>
                  </div>
                  <span className="bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[9px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider font-mono">
                    {isPremiumUser ? "Pro Active" : "Free Tier"}
                  </span>
                </div>

                <div className="bg-surface-container-high/60 border border-outline-variant/30 rounded-2xl p-4 flex justify-between items-center text-xs">
                  <div className="flex flex-col">
                    <span className="text-on-surface-variant text-[10px] uppercase font-mono tracking-wider">
                      AI Chat Quota
                    </span>
                    <span className="text-sm font-bold text-on-surface mt-1">
                      {isPremiumUser ? "∞ Unlimited Queries" : `${remainingQuota} / 5 remaining`}
                    </span>
                  </div>
                  
                  {!isPremiumUser && (
                    <button
                      onClick={() => {
                        setIsPremiumUser(true);
                        setRemainingQuota(9999);
                        setIsRateLimited(false);
                      }}
                      className="bg-gradient-to-r from-cebu-blue to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl transition-all duration-300 shadow-md hover:scale-[1.03] active:scale-95 flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">bolt</span>
                      Upgrade to Premium
                    </button>
                  )}
                </div>

                {!isPremiumUser && (
                  <p className="text-[10px] text-on-surface-variant italic text-center">
                    Billed locally at ₱49/month — help keep Cebu's local mapping servers running!
                  </p>
                )}
              </section>

              {/* Sinulog Emergency Center */}
              <section className="bg-surface-container-low border border-outline-variant rounded-3xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-error">emergency</span>
                  Cebu Emergency Dispatch Hub
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { name: "Cebu City Disaster Center (CCDRRMO)", phone: "(032) 262-1424", icon: "phone" },
                    { name: "Cebu City Traffic Commission (CCTO)", phone: "(032) 253-1226", icon: "directions_car" },
                    { name: "LTFRB Region 7 Hotlines", phone: "(032) 231-6221", icon: "description" },
                    { name: "Red Cross Cebu Chapter", phone: "(032) 253-9793", icon: "emergency_home" }
                  ].map((hotline, i) => (
                    <div key={i} className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-bold text-on-surface">{hotline.name}</h4>
                        <span className="text-[10px] text-on-surface-variant font-medium mt-0.5 block">{hotline.phone}</span>
                      </div>
                      <span className="material-symbols-outlined text-cebu-blue text-sm">call</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Saved home stations list */}
              <section className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-amber-500">star</span>
                  Saved Favorite Transit Stations
                </h3>
                <div className="space-y-2">
                  {[
                    { name: "Cebu IT Park Transit Terminal", lines: ["04L", "17B", "MyBus"] },
                    { name: "Ayala PUJ Center Terminal", lines: ["13C", "17B", "12L"] }
                  ].map((station, i) => (
                    <div key={i} className="p-3 bg-surface-container-low border border-outline-variant/30 rounded-xl flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-on-surface">{station.name}</p>
                        <div className="flex gap-1.5 mt-1">
                          {station.lines.map((ln) => (
                            <span key={ln} className="bg-cebu-blue/10 text-cebu-blue text-[9px] font-bold px-1.5 py-0.2 rounded">
                              {ln}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-outline text-sm">chevron_right</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

        </div>

        {/* Footer */}
        <footer className="hidden md:block py-4 border-t border-outline-variant/30 text-center text-[10px] text-on-surface-variant bg-surface-container-lowest">
          <p>© 2026 SugboWay Cebu Refactor • Compliant with LTFRB distance rules</p>
        </footer>

        {/* BOTTOM NAVIGATION BAR (Tab selector on Mobile) */}
        <nav className="md:hidden fixed bottom-0 left-0 w-full z-45 flex justify-around items-center px-4 pb-4 pt-2 bg-surface shadow-[0_-4px_10px_rgba(0,0,0,0.06)] border-t border-outline-variant/20">
          {[
            { id: "map", label: "Map", icon: "map" },
            { id: "rush", label: "Rush Hour", icon: "analytics" },
            { id: "chat", label: "Chat", icon: "smart_toy" },
            { id: "profile", label: "Profile", icon: "person" },
          ].map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id as any)}
                className={`
                  flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all duration-200 select-none
                  ${
                    isActive
                      ? "bg-secondary-container text-on-secondary-container font-bold"
                      : "text-on-surface-variant hover:bg-surface-container-high"
                  }
                `}
              >
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                  {item.icon}
                </span>
                <span className="text-[10px] font-medium mt-0.5">{item.label}</span>
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
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-surface-container-high border border-outline-variant/30 shadow-2xl rounded-3xl p-6 max-w-sm w-full space-y-4 animate-[scaleUp_0.3s_ease-out] text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 animate-pulse" />
              
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto text-amber-500 animate-bounce">
                <span className="material-symbols-outlined text-3xl">stars</span>
              </div>
              
              <div className="space-y-1">
                <h3 className="text-lg font-extrabold text-on-surface">SugboWay Limit Reached</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  You have exceeded the free tier allowance of **5 AI queries per hour**. Upgrade to **SugboWay Premium** to unlock unlimited mapping, offline capabilities, and RAG multi-hop routing!
                </p>
              </div>

              <div className="bg-surface-container-highest/60 border border-outline-variant/30 rounded-2xl py-2 px-3 text-xs font-mono text-on-surface-variant flex justify-between items-center">
                <span>Free Reset:</span>
                <span className="font-bold text-cebu-blue">
                  {rateLimitResetSeconds > 60 
                    ? `~${Math.ceil(rateLimitResetSeconds / 60)} mins` 
                    : `~${rateLimitResetSeconds}s`}
                </span>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    setIsPremiumUser(true);
                    setRemainingQuota(9999);
                    setIsRateLimited(false);
                  }}
                  className="w-full bg-gradient-to-r from-cebu-blue to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-extrabold text-xs py-3 rounded-2xl transition-all duration-300 shadow-md hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">bolt</span>
                  Upgrade to Premium (₱49)
                </button>
                <button
                  onClick={() => setIsRateLimited(false)}
                  className="w-full bg-surface-container-highest hover:bg-on-surface/5 border border-outline-variant/30 text-on-surface text-xs py-2.5 rounded-2xl transition-all font-medium"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
