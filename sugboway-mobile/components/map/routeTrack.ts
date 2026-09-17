import type { RouteResult } from "../../domain";
import type { GeoJSONFeatureCollection } from "../../domain/types";
import type { RouteGeometry } from "../../lib/api";

/** Shared empty FeatureCollection — a `null` route (nothing selected yet)
 *  renders no track and no stops. */
export const EMPTY_FEATURE_COLLECTION: GeoJSONFeatureCollection = { type: "FeatureCollection", features: [] };

export type ShapeFetcher = (routeId: string) => Promise<RouteGeometry | null>;

/**
 * Pure builder for the route track's FeatureCollection — no RN or MapLibre
 * imports, so it can be unit-tested without touching the native module.
 *
 * `getShape` (in production, `fetchRouteShape` from lib/api.ts) returns a
 * bare, already-JSON.parsed GeoJSON geometry, or `null` — NEVER a
 * FeatureCollection and never a `{ features: [...] }` wrapper. So every
 * geometry is wrapped in a Feature here. When a leg has no `routeId`, or the
 * fetch resolves `null` (no road geometry on file for that route), this
 * falls back to a straight line between the leg's two stops rather than
 * fabricating a plausible-looking path.
 */
export async function buildTrackFeatureCollection(
  route: RouteResult,
  getShape: ShapeFetcher
): Promise<GeoJSONFeatureCollection> {
  const features: GeoJSONFeatureCollection["features"] = [];
  for (const leg of route.legs) {
    const geometry = leg.routeId ? await getShape(leg.routeId) : null;
    if (geometry) {
      features.push({ type: "Feature", geometry, properties: { legType: leg.type } });
    } else {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [leg.fromStop.location.lon, leg.fromStop.location.lat],
            [leg.toStop.location.lon, leg.toStop.location.lat],
          ],
        },
        properties: { legType: leg.type },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** Pure builder for the stop-dots FeatureCollection: one Point per leg endpoint. */
export function buildStopsFeatureCollection(route: RouteResult | null): GeoJSONFeatureCollection {
  return {
    type: "FeatureCollection",
    features: (route?.legs ?? []).flatMap((leg) =>
      [leg.fromStop, leg.toStop].map((s) => ({
        type: "Feature" as const,
        geometry: { type: "Point", coordinates: [s.location.lon, s.location.lat] },
        properties: { name: s.stopName },
      }))
    ),
  };
}
