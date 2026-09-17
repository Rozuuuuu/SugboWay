import {
  EMPTY_FEATURE_COLLECTION,
  buildStopsFeatureCollection,
  buildTrackFeatureCollection,
} from "../../components/map/routeTrack";
import type { GTFSStop, RouteLeg, RouteResult } from "../../domain";
import type { RouteGeometry } from "../../lib/api";

// Pure-logic tests only — no RN, no @maplibre/maplibre-react-native import
// anywhere in this file or in routeTrack.ts. The map itself is a native
// module and can't be meaningfully unit-tested (see components/map/RouteMap.tsx);
// what CAN be tested is whether the FeatureCollection builder wraps a real
// geometry correctly and falls back to a straight line only when geometry
// is genuinely absent — exactly the bug this file guards against regressing:
// fetchRouteShape returns a bare, already-parsed geometry (or null), never a
// FeatureCollection, so a `.features` check on it would silently no-op and
// every route would fall back to a straight line while looking like it works.

function stop(stopName: string, lat: number, lon: number): GTFSStop {
  return {
    stopId: stopName.toLowerCase().replace(/\s+/g, "-"),
    stopName,
    aliases: [],
    location: { lat, lon },
    routeIds: [],
    wheelchairAccessible: false,
    hasShelter: false,
    isTerminal: false,
  };
}

function leg(overrides: Partial<RouteLeg> = {}): RouteLeg {
  return {
    type: "transit",
    routeId: "13C",
    fromStop: stop("Colon Street", 10.297, 123.899),
    toStop: stop("USC Talamban", 10.352, 123.912),
    durationSeconds: 900,
    distanceMeters: 6000,
    instructions: [],
    ...overrides,
  };
}

function route(legs: RouteLeg[]): RouteResult {
  return {
    legs,
    totalTimeSeconds: 900,
    totalFarePHP: 13,
    transfers: 0,
    crowdingWorstLeg: 0.2,
    geoJson: { type: "FeatureCollection", features: [] },
  };
}

describe("buildTrackFeatureCollection", () => {
  it("wraps a fetched geometry in a Feature — not a bare geometry, not a FeatureCollection", async () => {
    const geometry: RouteGeometry = {
      type: "LineString",
      coordinates: [
        [123.899, 10.297],
        [123.912, 10.352],
      ],
    };
    const getShape = jest.fn().mockResolvedValue(geometry);

    const fc = await buildTrackFeatureCollection(route([leg()]), getShape);

    expect(getShape).toHaveBeenCalledWith("13C");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]).toEqual({
      type: "Feature",
      geometry,
      properties: { legType: "transit" },
    });
  });

  it("falls back to a straight line between the leg's stops when the shape fetch resolves null", async () => {
    const getShape = jest.fn().mockResolvedValue(null);
    const oneLeg = leg();

    const fc = await buildTrackFeatureCollection(route([oneLeg]), getShape);

    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]).toEqual({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [oneLeg.fromStop.location.lon, oneLeg.fromStop.location.lat],
          [oneLeg.toStop.location.lon, oneLeg.toStop.location.lat],
        ],
      },
      properties: { legType: "transit" },
    });
  });

  it("falls back to a straight line for a leg with no routeId, without calling the shape fetcher", async () => {
    const getShape = jest.fn().mockResolvedValue({ type: "LineString", coordinates: [] });
    const walkLeg = leg({ type: "walking", routeId: undefined });

    const fc = await buildTrackFeatureCollection(route([walkLeg]), getShape);

    expect(getShape).not.toHaveBeenCalled();
    expect(fc.features[0].geometry).toEqual({
      type: "LineString",
      coordinates: [
        [walkLeg.fromStop.location.lon, walkLeg.fromStop.location.lat],
        [walkLeg.toStop.location.lon, walkLeg.toStop.location.lat],
      ],
    });
  });

  it("falls back only for the leg genuinely missing geometry, in a mixed multi-leg route", async () => {
    const legWithShape = leg({ routeId: "13C" });
    const legWithoutShape = leg({
      routeId: "04L",
      fromStop: stop("Ayala Center", 10.318, 123.905),
      toStop: stop("IT Park", 10.33, 123.907),
    });
    const geometry: RouteGeometry = { type: "LineString", coordinates: [[123.9, 10.3]] };

    // "04L" has a routeId, so the fetcher IS called for it — but the backend
    // has no shape on file, so it resolves null just like a real 404 would.
    const getShape = jest.fn(async (routeId: string) => (routeId === "13C" ? geometry : null));

    const fc = await buildTrackFeatureCollection(route([legWithShape, legWithoutShape]), getShape);

    expect(getShape).toHaveBeenCalledWith("13C");
    expect(getShape).toHaveBeenCalledWith("04L");
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry).toEqual(geometry);
    expect(fc.features[1].geometry).toEqual({
      type: "LineString",
      coordinates: [
        [legWithoutShape.fromStop.location.lon, legWithoutShape.fromStop.location.lat],
        [legWithoutShape.toStop.location.lon, legWithoutShape.toStop.location.lat],
      ],
    });
  });

  it("returns an empty FeatureCollection for a route with no legs", async () => {
    const fc = await buildTrackFeatureCollection(route([]), jest.fn());
    expect(fc).toEqual({ type: "FeatureCollection", features: [] });
  });
});

describe("buildStopsFeatureCollection", () => {
  it("returns an empty FeatureCollection for a null route", () => {
    expect(buildStopsFeatureCollection(null)).toEqual(EMPTY_FEATURE_COLLECTION);
  });

  it("emits one Point feature per leg endpoint", () => {
    const oneLeg = leg();
    const fc = buildStopsFeatureCollection(route([oneLeg]));

    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]).toEqual({
      type: "Feature",
      geometry: { type: "Point", coordinates: [oneLeg.fromStop.location.lon, oneLeg.fromStop.location.lat] },
      properties: { name: oneLeg.fromStop.stopName },
    });
    expect(fc.features[1]).toEqual({
      type: "Feature",
      geometry: { type: "Point", coordinates: [oneLeg.toStop.location.lon, oneLeg.toStop.location.lat] },
      properties: { name: oneLeg.toStop.stopName },
    });
  });
});
