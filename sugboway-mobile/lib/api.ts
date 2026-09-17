import { ROUTING_API_URL, AI_API_URL } from "./config";
import type {
  Coordinate, GTFSRoute, GTFSStop, PassengerType, RouteResult,
} from "../domain";

/** Minimal GeoJSON geometry shape — enough to describe what /route/shape hands back
 *  after its `geojson` string field is parsed. Not a full geometry library on purpose. */
export interface RouteGeometry {
  type: string;
  coordinates: unknown;
}

async function getJson<T>(url: string, emptyOn404: T | undefined = undefined): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404 && emptyOn404 !== undefined) return emptyOn404;
    throw new Error(`${url} -> ${res.status}`);
  }
  return (await res.json()) as T;
}

export function searchRoutes(
  origin: Coordinate, dest: Coordinate, passengerType: PassengerType, accessible: boolean,
): Promise<RouteResult[]> {
  const q = `origin_lat=${origin.lat}&origin_lon=${origin.lon}&dest_lat=${dest.lat}&dest_lon=${dest.lon}`;
  return getJson<RouteResult[]>(
    `${ROUTING_API_URL}/api/v1/route/search?${q}&passenger_type=${passengerType}&accessible=${accessible}`,
    [],
  );
}

export function fetchServingRoutes(origin: Coordinate, dest: Coordinate, radius = 700) {
  const q = `origin_lat=${origin.lat}&origin_lon=${origin.lon}&dest_lat=${dest.lat}&dest_lon=${dest.lon}`;
  return getJson<{ serving: unknown[] }>(
    `${ROUTING_API_URL}/api/v1/routes/serving?${q}&radius=${radius}`, { serving: [] },
  );
}

/**
 * GET /route/shape returns { route_id, geojson } where `geojson` is a JSON-ENCODED
 * STRING holding a PostGIS geometry — not an object, and not a FeatureCollection.
 * Parse it and hand back the bare geometry; the caller wraps it in a Feature.
 */
export async function fetchRouteShape(routeId: string): Promise<RouteGeometry | null> {
  try {
    const data = await getJson<{ geojson?: string }>(
      `${ROUTING_API_URL}/api/v1/route/shape?route_id=${routeId}`,
    );
    if (!data.geojson) return null;
    return JSON.parse(data.geojson) as RouteGeometry;
  } catch {
    return null; // missing shape (handler 404s) or malformed JSON -> straight-line fallback
  }
}

export async function fetchRouteStops(routeId: string): Promise<GTFSStop[]> {
  const data = await getJson<{ stops?: GTFSStop[]; nearbyStops?: GTFSStop[] }>(
    `${ROUTING_API_URL}/api/v1/route/stops?route_id=${routeId}`, {},
  );
  return data.stops ?? data.nearbyStops ?? [];
}

export async function fetchCongestion(routeId: string, isPeak: boolean, weatherBeta: number) {
  try {
    return await getJson<{ flow_ratio?: number; is_peak?: boolean }>(
      `${ROUTING_API_URL}/api/v1/congestion?route_id=${routeId}&is_peak=${isPeak}&weather_beta=${weatherBeta}`,
    );
  } catch {
    return null; // congestion is an enrichment, never a blocker
  }
}

export async function fetchNearbyStops(lat: number, lon: number, radius = 500): Promise<GTFSStop[]> {
  const data = await getJson<{ nearbyStops?: GTFSStop[] }>(
    `${ROUTING_API_URL}/api/v1/stops/nearby?lat=${lat}&lon=${lon}&radius=${radius}`, {},
  );
  return data.nearbyStops ?? [];
}

export async function fetchAllRoutes(): Promise<GTFSRoute[]> {
  // GET /routes returns { count, routes: [...] } — not a bare array.
  const data = await getJson<{ routes?: GTFSRoute[] }>(`${ROUTING_API_URL}/api/v1/routes`, {});
  return data.routes ?? [];
}

export interface CebuWeather {
  temp_c: number;
  humidity: number;
  text: string;
}

export async function fetchWeather(): Promise<CebuWeather | null> {
  try {
    return await getJson<CebuWeather>(`${ROUTING_API_URL}/api/v1/weather`);
  } catch {
    return null; // weather is a nicety, never a blocker
  }
}

export async function askAi(message: string, token: string | null) {
  const res = await fetch(`${AI_API_URL}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
