"use client";

import React, { useState, useEffect, useRef } from "react";
import type { RouteResult, PassengerType } from "@/domain";
import RouteCard from "@/components/route/RouteCard";
import RouteCodeBadge from "@/components/route/RouteCodeBadge";
import { calculateFare, formatPHP } from "@/domain";

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

export default function DemoPage() {
  // Shared States
  const [currentTab, setCurrentTab] = useState<"map" | "rush" | "chat" | "profile">("map");
  const [passengerType, setPassengerType] = useState<PassengerType>("regular");
  const [isSafetyModeActive, setIsSafetyModeActive] = useState(false);

  // Tab 1: Map States
  const [selectedRouteIdx, setSelectedRouteIdx] = useState<number | null>(0);
  const [origin, setOrigin] = useState("Cebu IT Park");
  const [destination, setDestination] = useState("Downtown Colon St.");
  const [isTrafficBannerOpen, setIsTrafficBannerOpen] = useState(true);

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
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, currentTab]);

  // Traffic Gauge Pointer Jitter Effect
  useEffect(() => {
    const interval = setInterval(() => {
      const baseVal = isSafetyModeActive ? -40 : 45; // Safety Mode shows better flow
      const jitter = (Math.random() - 0.5) * 6;
      setGaugeRotate(baseVal + jitter);
    }, 2500);
    return () => clearInterval(interval);
  }, [isSafetyModeActive]);

  // Handling quick question chips in chat
  const handleQuickQuestion = (question: string) => {
    let responseText = "";
    let responseCeb = "";
    let suggestedStop = undefined;

    const lowerQ = question.toLowerCase();
    if (lowerQ.includes("fare") || lowerQ.includes("plete")) {
      const fare = calculateFare(4.5, passengerType, 0);
      const studentTag = passengerType !== "regular" ? " (Discount Applied)" : "";
      responseText = `According to LTFRB Order 2023, the base fare is ${formatPHP(13.0)} for the first 4 kilometers, plus ${formatPHP(1.8)} per extra km. For a standard 4.5km route, your total fare is ${formatPHP(fare.totalFare)}${studentTag}.`;
      responseCeb = `Matod sa LTFRB Order 2023, ang pliti kay ${formatPHP(13.0)} sa unang 4 kilometro, unya dugang ${formatPHP(1.8)} kada kilometro human ana.`;
    } else if (lowerQ.includes("rush") || lowerQ.includes("traffic")) {
      responseText = isSafetyModeActive 
        ? "We are currently in Safety Mode. CCTV monitors report heavy delays along Ramos St, but modernized E-Jeeps are moving smoothly." 
        : "Standard rush-hour traffic detected. Fuente Osmeña circle and Metro Colon are currently bottlenecks (Congestion: 85%). Expect 15-20 min delays on traditional routes.";
      responseCeb = "Dungag trapik sa Fuente Osmeña ug Colon. Likayi ang traditional jeepney ug sakay sa modernong e-jeep.";
    } else if (lowerQ.includes("safe") || lowerQ.includes("tonight") || lowerQ.includes("late")) {
      responseText = "Commuting late? Switch on Safety Mode! Next.js prioritized routing engine filters for modernized corridors featuring on-board CCTVs and live GPS tracking for emergency Sinulog coordinates.";
      responseCeb = "Gabiing commute? I-on ang Safety Mode para mas hayag ug naay CCTV imong masakyan.";
    } else {
      responseText = "The nearest terminal for 13C or 04L going downtown is just 200m away at the Ayala Transit Terminal Hub. You can wave your palm down to board modern vehicles.";
      responseCeb = "Ang pinakaduol nga terminal padung Colon kay naa sa Ayala PUJ Terminal, mga 4 minutos nga lakaw.";
      suggestedStop = {
        name: "Ayala Transit Terminal Hub",
        walkTime: "4 mins walk",
        routeIds: ["13C", "04L"],
      };
    }

    const newUserMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text: question,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newAiMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: "ai",
      text: responseText,
      cebuanoText: responseCeb,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedStop,
    };

    setChatMessages((prev) => [...prev, newUserMsg, newAiMsg]);
  };

  // Chat send custom message
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

    // Mock typing effect delay
    setTimeout(() => {
      handleQuickQuestion(userText);
    }, 800);
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
                    Suggested Routes ({MOCK_ROUTES.length})
                  </h2>
                  <span className="text-xs text-on-surface-variant">
                    Filters: {passengerType.toUpperCase()}
                  </span>
                </div>

                <div className="flex flex-col gap-4">
                  {MOCK_ROUTES.map((route, idx) => (
                    <RouteCard
                      key={idx}
                      route={route}
                      passengerType={passengerType}
                      isSelected={selectedRouteIdx === idx}
                      onClick={() => setSelectedRouteIdx(idx)}
                    />
                  ))}
                </div>
              </section>

              {/* Dynamic Map Mock Representation */}
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
                  {/* Visual background map */}
                  <div className="absolute inset-0 z-0 bg-[#f4f3f0]">
                    <div 
                      className="absolute inset-0 opacity-80" 
                      style={{
                        backgroundImage: "radial-gradient(#d5d3ce 1.5px, transparent 1.5px), radial-gradient(#d5d3ce 1.5px, #f4f3f0 1.5px)",
                        backgroundSize: "24px 24px",
                        backgroundPosition: "0 0, 12px 12px"
                      }}
                    />
                    
                    {/* Fake OSM streets / lines */}
                    <div className="absolute top-[20%] left-0 right-0 h-4 bg-white/60 border-y border-outline-variant/20 -rotate-3" />
                    <div className="absolute top-0 bottom-0 left-[35%] w-6 bg-white/60 border-x border-outline-variant/20 rotate-12" />
                    <div className="absolute top-0 bottom-0 right-[25%] w-4 bg-white/60 border-x border-outline-variant/20 -rotate-45" />

                    {/* Selected Route Path drawing */}
                    {selectedRouteIdx !== null && selectedRouteIdx < 3 && (
                      <div 
                        className="absolute top-[35%] left-[20%] right-[30%] h-1 bg-cebu-blue rounded-full border border-white shadow-xs transition-all duration-300 animate-[fadeIn_0.5s_ease-out]"
                        style={{ transform: "rotate(15deg)" }}
                      >
                        {/* Glowing pulses */}
                        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-3 h-3 bg-cebu-blue rounded-full border border-white animate-ping" />
                        <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-3 h-3 bg-cebu-blue rounded-full border border-white animate-ping" />
                      </div>
                    )}

                    {/* Stop Markers */}
                    <div className="absolute top-[40%] left-[22%] -translate-y-1/2 flex flex-col items-center">
                      <span className="w-5 h-5 bg-safe-green rounded-full border-2 border-white shadow-xs flex items-center justify-center text-[10px] text-white font-bold">
                        S
                      </span>
                      <span className="bg-white/90 backdrop-blur-sm border border-outline-variant text-[9px] font-bold px-1 rounded mt-1 select-none shadow-xs text-on-surface">
                        IT Park
                      </span>
                    </div>

                    <div className="absolute top-[52%] right-[28%] -translate-y-1/2 flex flex-col items-center">
                      <span className="w-5 h-5 bg-error rounded-full border-2 border-white shadow-xs flex items-center justify-center text-[10px] text-white font-bold">
                        D
                      </span>
                      <span className="bg-white/90 backdrop-blur-sm border border-outline-variant text-[9px] font-bold px-1 rounded mt-1 select-none shadow-xs text-on-surface">
                        Colon St
                      </span>
                    </div>
                  </div>

                  {/* Glassmorphism Over-Map Control */}
                  <div className="absolute bottom-4 left-4 right-4 bg-surface-container-lowest/80 backdrop-blur-md border border-outline-variant rounded-xl p-3 flex justify-between items-center z-10 shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-cebu-blue">directions_bus</span>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-on-surface">
                          {selectedRouteIdx !== null ? `Selected Option: Route ${MOCK_ROUTES[selectedRouteIdx].legs[0]?.routeShortName || "Walk"}` : "Select a Route above"}
                        </span>
                        <span className="text-[10px] text-on-surface-variant">
                          {selectedRouteIdx !== null ? `${formatDuration(MOCK_ROUTES[selectedRouteIdx].totalTimeSeconds)} total duration` : "Click on a card to preview"}
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

      </div>
    </div>
  );
}
