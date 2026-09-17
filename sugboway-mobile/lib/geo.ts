import type { GeoJSONFeatureCollection } from "../domain/types";

/**
 * Computes a flat `[west, south, east, north]` bounding-box tuple from every
 * coordinate in a FeatureCollection.
 *
 * This is the exact shape `@maplibre/maplibre-react-native@11`'s
 * `CameraRef.fitBounds()` (and `Camera`'s `initialViewState.bounds`) expect
 * — `LngLatBounds` is itself typed as `[west, south, east, north]` in this
 * version of the library. It is NOT `{ ne, sw }` — that's the v10 shape and
 * does not apply here. Returning the flat tuple means callers can pass the
 * result straight into `fitBounds()` with no adapter.
 *
 * Walks `feature.geometry.coordinates` recursively rather than switching on
 * `geometry.type`, because GeoJSON geometries nest coordinates to different
 * depths: `Point` is `[x, y]`, `LineString` is `[[x, y], ...]`, and
 * `MultiLineString` / `Polygon` nest one level deeper still (`MultiPolygon`
 * deeper again). Real route shapes fetched from PostGIS can be any of
 * these. The walk bottoms out at the first array whose head is a number —
 * i.e. a `[lon, lat]` pair — regardless of how many arrays wrap it.
 *
 * Returns `null` for an empty FeatureCollection (no features, or features
 * with no coordinates) rather than a degenerate `[0, 0, 0, 0]` box — a
 * caller must check for `null` and skip reframing instead of fitting the
 * camera to Null Island.
 *
 * A FeatureCollection containing a single `Point` (or multiple coincident
 * points) legitimately produces a zero-area box: `west === east` and
 * `south === north`. That tuple is returned as-is, un-guarded — it is not
 * treated as a `null`/empty case. `fitBounds()` on a zero-area box still
 * centers the camera on that point; a caller that wants a guaranteed
 * minimum zoom for the single-point case should pad the request itself
 * (e.g. via the `padding` option), not expect `boundsOf` to invent a
 * non-zero area.
 */
export function boundsOf(
  fc: GeoJSONFeatureCollection
): [west: number, south: number, east: number, north: number] | null {
  const coords: number[][] = [];
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      coords.push(c as number[]);
    } else if (Array.isArray(c)) {
      c.forEach(walk);
    }
  };
  fc.features.forEach((f) => walk(f.geometry?.coordinates));
  if (coords.length === 0) return null;

  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);

  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}
