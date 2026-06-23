"use client";

import React, { useEffect, useRef, useState } from "react";
import { searchPlaces, type Place } from "@/data/places";

const ROUTING_API_URL = process.env.NEXT_PUBLIC_ROUTING_API_URL || "http://localhost:8080";

interface NearbyStop {
  stopId: string;
  stopName: string;
  routeIds?: string[];
}

interface PlaceDropdownProps {
  /** Field label, e.g. "From" / "To". */
  label: string;
  /** Material symbol name for the leading icon. */
  icon: string;
  /** Current text value (controlled). */
  value: string;
  /** Called on every keystroke and on selection (canonical name). */
  onChange: (text: string) => void;
  /** Called when a known hub is picked, with its coordinates. */
  onSelectPlace?: (place: Place) => void;
  placeholder?: string;
}

/**
 * PlaceDropdown — typeahead combobox over Cebu's primary hubs.
 *
 * Stays free-text (you can type any place), but surfaces matching hubs and
 * local aliases ("TC" -> USC Talamban) in a map-overlay list. Picking a hub
 * fires an ST_DWithin nearby-stops query and previews the closest GTFS stops.
 */
export default function PlaceDropdown({
  label,
  icon,
  value,
  onChange,
  onSelectPlace,
  placeholder,
}: PlaceDropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [nearby, setNearby] = useState<{ loading: boolean; stops: NearbyStop[] } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const suggestions = searchPlaces(value);

  // Close when clicking outside the field.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const fetchNearby = async (place: Place) => {
    setNearby({ loading: true, stops: [] });
    try {
      const res = await fetch(
        `${ROUTING_API_URL}/api/v1/stops/nearby?lat=${place.lat}&lon=${place.lon}&radius=500`
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const stops: NearbyStop[] = data.nearbyStops || [];
      setNearby({ loading: false, stops });
    } catch {
      // Spatial query is a nicety, not a blocker — fail quietly.
      setNearby(null);
    }
  };

  const selectPlace = (place: Place) => {
    onChange(place.name);
    onSelectPlace?.(place);
    setOpen(false);
    fetchNearby(place);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && open && suggestions[highlight]) {
      e.preventDefault();
      selectPlace(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {/* Field shell — matches the surrounding search inputs */}
      <div className="flex items-center bg-surface-container-low rounded-xl px-4 py-3 border border-outline-variant hover:border-cebu-blue focus-within:border-cebu-blue transition-colors group">
        <span className="material-symbols-outlined text-outline group-focus-within:text-cebu-blue shrink-0">
          {icon}
        </span>
        <div className="flex-1 flex flex-col ml-3 min-w-0">
          <label className="text-xs font-medium text-on-surface-variant font-display">{label}</label>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
              setHighlight(0);
              setNearby(null);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            className="bg-transparent border-none p-0 text-base font-semibold text-on-surface focus:outline-none focus:ring-0 placeholder:text-outline-variant"
            placeholder={placeholder}
          />
        </div>
      </div>

      {/* Suggestions overlay — subtle blur so the map stays faintly visible beneath */}
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1.5 py-1.5 rounded-xl border border-outline-variant bg-surface-container-lowest/85 backdrop-blur shadow-lg max-h-64 overflow-y-auto"
        >
          {suggestions.map((place, idx) => (
            <li key={place.id} role="option" aria-selected={idx === highlight}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => selectPlace(place)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  idx === highlight ? "bg-cebu-blue/10" : "hover:bg-surface-container"
                }`}
              >
                <span className="material-symbols-outlined text-cebu-blue text-lg shrink-0">place</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-on-surface font-display truncate">
                    {place.name}
                  </span>
                  <span className="block text-xs text-on-surface-variant">{place.category}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Nearby-stops preview from the ST_DWithin query */}
      {nearby && (
        <div className="mt-1.5 px-1 text-xs text-on-surface-variant">
          {nearby.loading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-cebu-blue border-t-transparent rounded-full animate-spin" />
              Checking nearby stops…
            </span>
          ) : nearby.stops.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-on-surface">
                {nearby.stops.length} stop{nearby.stops.length !== 1 ? "s" : ""} within 500m
              </span>
              {/* Route codes for the closest stop render in mono */}
              {nearby.stops[0]?.routeIds && nearby.stops[0].routeIds.length > 0 && (
                <span className="flex items-center gap-1">
                  {nearby.stops[0].routeIds.slice(0, 3).map((code) => (
                    <span
                      key={code}
                      className="font-mono text-[10px] font-bold text-cebu-blue bg-cebu-blue/10 px-1.5 py-0.5 rounded"
                    >
                      {code}
                    </span>
                  ))}
                </span>
              )}
            </div>
          ) : (
            <span>No GTFS stops within 500m.</span>
          )}
        </div>
      )}
    </div>
  );
}
