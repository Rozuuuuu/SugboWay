import { ROUTING_API_URL, AI_API_URL } from "./config";
import type {
  Coordinate, GTFSRoute, GTFSStop, PassengerType, RouteResult,
} from "../domain";
// GeoJSONFeatureCollection isn't re-exported by the domain barrel (domain/index.ts is a
// byte-identical copy of the web app's and must not be edited) — import it directly.
import type { GeoJSONFeatureCollection } from "../domain/types";

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

export async function fetchRouteShape(routeId: string): Promise<GeoJSONFeatureCollection | null> {
  try {
    return await getJson<GeoJSONFeatureCollection>(
      `${ROUTING_API_URL}/api/v1/route/shape?route_id=${routeId}`,
    );
  } catch {
    return null; // no road geometry -> caller falls back to a straight line
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

export const fetchAllRoutes = () => getJson<GTFSRoute[]>(`${ROUTING_API_URL}/api/v1/routes`, []);
export const fetchWeather = () => getJson<unknown>(`${ROUTING_API_URL}/api/v1/weather`, null);

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
