import { boundsOf } from "../../lib/geo";
import type { GeoJSONFeatureCollection } from "../../domain/types";

// Pure-logic tests — no RN, no @maplibre/maplibre-react-native import. See
// lib/geo.ts for why the return shape is a flat [w, s, e, n] tuple, not
// {ne, sw}.

function fc(features: GeoJSONFeatureCollection["features"]): GeoJSONFeatureCollection {
  return { type: "FeatureCollection", features };
}

describe("boundsOf", () => {
  it("returns null for an empty FeatureCollection", () => {
    expect(boundsOf(fc([]))).toBeNull();
  });

  it("computes a [west, south, east, north] tuple from a LineString", () => {
    const collection = fc([
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[123.85, 10.28], [123.92, 10.35]] },
      },
    ]);

    // Order matters and is easy to invert: [west, south, east, north] is
    // [minLon, minLat, maxLon, maxLat]. Asserting the exact tuple (not just
    // that the four values are present) catches a lon/lat swap.
    expect(boundsOf(collection)).toEqual([123.85, 10.28, 123.92, 10.35]);
  });

  it("takes the min/max across multiple features, not just the first", () => {
    const collection = fc([
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[123.9, 10.3], [123.95, 10.32]] },
      },
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[123.8, 10.25], [123.88, 10.4]] },
      },
    ]);

    expect(boundsOf(collection)).toEqual([123.8, 10.25, 123.95, 10.4]);
  });

  it("handles a MultiLineString (coordinates nested one level deeper than LineString)", () => {
    const collection = fc([
      {
        type: "Feature",
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [[123.85, 10.28], [123.9, 10.3]],
            [[123.86, 10.4], [123.92, 10.35]],
          ],
        },
      },
    ]);

    expect(boundsOf(collection)).toEqual([123.85, 10.28, 123.92, 10.4]);
  });

  it("handles a Polygon (nested one level deeper than LineString, ring-closed)", () => {
    const collection = fc([
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [123.85, 10.28],
              [123.92, 10.28],
              [123.92, 10.35],
              [123.85, 10.35],
              [123.85, 10.28],
            ],
          ],
        },
      },
    ]);

    expect(boundsOf(collection)).toEqual([123.85, 10.28, 123.92, 10.35]);
  });

  it("returns a zero-area but valid tuple for a single Point", () => {
    const collection = fc([
      { type: "Feature", geometry: { type: "Point", coordinates: [123.9, 10.31] } },
    ]);

    const result = boundsOf(collection);
    expect(result).toEqual([123.9, 10.31, 123.9, 10.31]);
    expect(result?.[0]).toBe(result?.[2]); // west === east
    expect(result?.[1]).toBe(result?.[3]); // south === north
  });

  it("returns null when a feature has no coordinates", () => {
    const collection = fc([
      { type: "Feature", geometry: { type: "LineString", coordinates: [] } },
    ]);

    expect(boundsOf(collection)).toBeNull();
  });
});
