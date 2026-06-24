"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PassengerType, RouteResult, RouteLeg } from "@/domain";
import { calculateFare } from "@/domain";
import { searchPlaces } from "@/data/places";
import RouteCard from "./RouteCard";

const ROUTING_API_URL = process.env.NEXT_PUBLIC_ROUTING_API_URL || "http://localhost:8080";
const PAGE_SIZE = 10;

// Mirrors domain.RouteSummary from the Go API.
interface RouteSummary {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  isModernized: boolean;
  hasAircon: boolean;
  hasConductor: boolean;
  distanceMeters: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
}

type VehicleFilter = "all" | "traditional" | "modern" | "bus";
type SortKey = "code" | "length";

interface AllRoutesPanelProps {
  /** Shared map slot callback (the parent moves its one map into the open card). */
  mapSlot: (node: HTMLDivElement | null) => void;
  /** Tell the parent which route the map should draw (null = none open). */
  onActiveRouteChange: (route: RouteResult | null) => void;
  passengerType: PassengerType;
  setPassengerType: (t: PassengerType) => void;
  isOffline?: boolean;
}

// "Talamban to Colon" -> ["Talamban", "Colon"].
function parseEndpoints(longName: string): [string, string] {
  const parts = (longName || "").split(/\s+(?:to|-|–|→|via)\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts[parts.length - 1]];
  return [longName || "Start", "End"];
}

function vehicleCategory(s: RouteSummary): "traditional" | "modern" | "bus" {
  const name = `${s.routeShortName} ${s.routeLongName}`.toLowerCase();
  if (/\b(bus|mybus|ceres)\b/.test(name)) return "bus";
  if (s.isModernized) return "modern";
  return "traditional";
}

// Build a single-leg RouteResult so the route renders as a RouteCard and its
// real geometry draws via /route/shape on open.
function routeSummaryToRouteResult(s: RouteSummary, passengerType: PassengerType): RouteResult {
  const distanceMeters = Number(s.distanceMeters) || 0;
  const distanceKm = distanceMeters / 1000;
  const fare = calculateFare(distanceKm, passengerType, 0).totalFare;
  const durationSeconds = Math.max(300, Math.round((distanceKm / 16) * 3600));
  const [fromLabel, toLabel] = parseEndpoints(s.routeLongName || s.routeShortName);
  const start = { lat: s.startLat || 10.31, lon: s.startLon || 123.89 };
  const end = { lat: s.endLat || 10.31, lon: s.endLon || 123.89 };
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
    fromStop: mkStop(fromLabel, start, true),
    toStop: mkStop(toLabel, end, false),
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

export default function AllRoutesPanel({
  mapSlot,
  onActiveRouteChange,
  passengerType,
  setPassengerType,
  isOffline = false,
}: AllRoutesPanelProps) {
  const [allRoutes, setAllRoutes] = useState<RouteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState(""); // debounced
  const [passingRoutes, setPassingRoutes] = useState<RouteSummary[] | null>(null);

  const [vehicle, setVehicle] = useState<VehicleFilter>("all");
  const [airconOnly, setAirconOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  // Load all routes once.
  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${ROUTING_API_URL}/api/v1/routes`);
      if (!res.ok) {
        // 404 means the API doesn't have this endpoint yet (needs redeploy).
        throw new Error(
          res.status === 404
            ? "The routing API doesn't have the /routes endpoint yet — redeploy sugboway-routing-api."
            : `The routing API returned an error (HTTP ${res.status}).`
        );
      }
      const data = await res.json();
      setAllRoutes(Array.isArray(data.routes) ? data.routes : []);
    } catch (e: any) {
      setError(e?.message || "Couldn't reach the routing API. Check the connection and try again.");
      setAllRoutes([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchAll();
  }, []);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // When the query resolves to a known hub, also pull routes passing through it.
  useEffect(() => {
    let cancelled = false;
    if (!query) {
      setPassingRoutes(null);
      return;
    }
    const place = searchPlaces(query, 1)[0];
    if (!place) {
      setPassingRoutes(null);
      return;
    }
    fetch(`${ROUTING_API_URL}/api/v1/routes/passing?lat=${place.lat}&lon=${place.lon}&radius=600`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setPassingRoutes(data && Array.isArray(data.routes) ? data.routes : []);
      })
      .catch(() => {
        if (!cancelled) setPassingRoutes(null); // fall back to text matches
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  // Reset to the first page (and close any open card) when the result set changes.
  useEffect(() => {
    setPage(1);
    setOpenId(null);
    onActiveRouteChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, vehicle, airconOnly, sortKey, passingRoutes]);

  // Compose the displayed list: text matches (+ geometric matches), filtered, sorted.
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let base: RouteSummary[];
    if (!q) {
      base = allRoutes;
    } else {
      const textMatches = allRoutes.filter(
        (r) =>
          r.routeShortName.toLowerCase().includes(q) ||
          r.routeLongName.toLowerCase().includes(q)
      );
      if (passingRoutes) {
        const byId = new Map<string, RouteSummary>();
        [...passingRoutes, ...textMatches].forEach((r) => byId.set(r.routeId, r));
        base = [...byId.values()];
      } else {
        base = textMatches;
      }
    }

    let out = base.filter((r) => {
      if (vehicle !== "all" && vehicleCategory(r) !== vehicle) return false;
      if (airconOnly && !r.hasAircon) return false;
      return true;
    });

    out = [...out].sort((a, b) =>
      sortKey === "length"
        ? a.distanceMeters - b.distanceMeters
        : a.routeShortName.localeCompare(b.routeShortName)
    );
    return out;
  }, [allRoutes, passingRoutes, query, vehicle, airconOnly, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleOpen = (summary: RouteSummary) => {
    if (openId === summary.routeId) {
      setOpenId(null);
      onActiveRouteChange(null);
    } else {
      setOpenId(summary.routeId);
      onActiveRouteChange(routeSummaryToRouteResult(summary, passengerType));
    }
  };

  const vehicleChips: { key: VehicleFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "traditional", label: "Jeepney" },
    { key: "modern", label: "Modern" },
    { key: "bus", label: "Bus" },
  ];
  const passengerOpts: PassengerType[] = ["regular", "student", "senior", "pwd"];

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex items-center bg-surface-container-low rounded-xl px-4 py-3 border border-outline-variant focus-within:border-cebu-blue transition-colors">
        <span className="material-symbols-outlined text-outline shrink-0">search</span>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search a place (e.g. Colon) or a route code (e.g. 13C)"
          className="flex-1 bg-transparent border-none p-0 ml-3 text-sm font-medium text-on-surface focus:outline-none focus:ring-0 placeholder:text-outline-variant"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="text-on-surface-variant hover:text-on-surface shrink-0"
            aria-label="Clear search"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {vehicleChips.map((c) => (
          <button
            key={c.key}
            onClick={() => setVehicle(c.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              vehicle === c.key
                ? "bg-cebu-blue text-white border-cebu-blue"
                : "bg-surface-container text-on-surface-variant border-outline-variant/50 hover:border-outline-variant"
            }`}
          >
            {c.label}
          </button>
        ))}

        <button
          onClick={() => setAirconOnly((v) => !v)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1 ${
            airconOnly
              ? "bg-aircon-cyan text-white border-aircon-cyan"
              : "bg-surface-container text-on-surface-variant border-outline-variant/50 hover:border-outline-variant"
          }`}
        >
          <span className="material-symbols-outlined text-sm">ac_unit</span>
          Aircon
        </button>

        <div className="ml-auto flex items-center gap-1.5 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-base">sort</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-surface-container border border-outline-variant/50 rounded-lg px-2 py-1 text-on-surface focus:outline-none focus:border-cebu-blue"
          >
            <option value="code">Code A–Z</option>
            <option value="length">Shortest first</option>
          </select>
        </div>
      </div>

      {/* Fare passenger type */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-on-surface-variant">Fare for</span>
        {passengerOpts.map((p) => (
          <button
            key={p}
            onClick={() => setPassengerType(p)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize transition-colors ${
              passengerType === p
                ? "bg-cebu-blue/10 text-cebu-blue"
                : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-8 bg-surface-container-low rounded-2xl border border-outline-variant/30 space-y-3">
          <div className="w-8 h-8 border-4 border-cebu-blue border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-on-surface-variant font-medium">Loading all Cebu routes…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center p-8 bg-error-container/10 rounded-2xl border border-error/20 space-y-2 text-center">
          <span className="material-symbols-outlined text-error text-3xl">error</span>
          <p className="text-sm text-error font-semibold">{error}</p>
          <button onClick={fetchAll} className="mt-1 text-sm font-semibold text-cebu-blue hover:underline">
            Try again
          </button>
        </div>
      ) : allRoutes.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 bg-surface-container-low rounded-2xl border border-outline-variant/30 text-center">
          <span className="material-symbols-outlined text-outline text-3xl">cloud_off</span>
          <p className="text-sm text-on-surface-variant font-semibold mt-2">No routes available yet.</p>
          <p className="text-xs text-outline mt-1">
            The server returned an empty list — the database may need seeding (apply the route
            migrations / run seed_runner.py).
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 bg-surface-container-low rounded-2xl border border-outline-variant/30 text-center">
          <span className="material-symbols-outlined text-outline text-3xl">search_off</span>
          <p className="text-sm text-on-surface-variant font-semibold mt-2">
            {query ? `No routes go through "${query}".` : "No routes match these filters."}
          </p>
          <p className="text-xs text-outline mt-1">Try another place, code, or filter.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-on-surface-variant">
            {filtered.length} route{filtered.length !== 1 ? "s" : ""}
            {query ? ` matching "${query}"` : ""}
          </p>
          <div className="flex flex-col gap-4">
            {pageItems.map((summary) => (
              <RouteCard
                key={summary.routeId}
                route={routeSummaryToRouteResult(summary, passengerType)}
                passengerType={passengerType}
                isSelected={openId === summary.routeId}
                expanded={openId === summary.routeId}
                onClick={() => toggleOpen(summary)}
                mapSlot={mapSlot}
                isOffline={isOffline}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-lg bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-base">chevron_left</span>
                Prev
              </button>
              <span className="text-xs text-on-surface-variant tabular-nums">
                Page {safePage} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-lg bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Next
                <span className="material-symbols-outlined text-base">chevron_right</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
