// v11 of @maplibre/maplibre-react-native renamed almost every component to
// align with MapLibre GL JS: <Map> (not <MapView>), <GeoJSONSource data={…}>
// (not <ShapeSource shape={…}>), <Layer type="line" paint={{"line-color"}}>
// (not <LineLayer style={{lineColor}}>), <ViewAnnotation lngLat={…}> (not
// <MarkerView>/<PointAnnotation>), <Camera initialViewState={{center, zoom}}>
// (not defaultSettings={{centerCoordinate, zoomLevel}}). Paint/layout are
// style-spec kebab-case; line-cap/line-join are layout, not paint. Do not
// "fix" any of this toward v10 names seen in older tutorials.
import { Map, Camera, GeoJSONSource, Layer, ViewAnnotation } from "@maplibre/maplibre-react-native";
import type { CameraRef } from "@maplibre/maplibre-react-native";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { fetchRouteShape } from "../../lib/api";
import { boundsOf } from "../../lib/geo";
import { useTheme } from "../ThemeProvider";
import { TOKENS } from "../../theme/tokens";
import type { RouteResult } from "../../domain";
import type { GeoJSONFeatureCollection } from "../../domain/types";
import { EMPTY_FEATURE_COLLECTION, buildStopsFeatureCollection, buildTrackFeatureCollection } from "./routeTrack";

// The domain's GeoJSONFeatureCollection is deliberately loose (kept
// zero-dependency: `geometry.type` is `string`, not a discriminated union)
// while @maplibre/maplibre-react-native's <GeoJSONSource data> prop is typed
// against strict @types/geojson. Both describe the same wire shape — this
// cast is a type-only boundary, not a runtime transform.
function toGeoJSON(fc: GeoJSONFeatureCollection): import("geojson").FeatureCollection {
  return fc as unknown as import("geojson").FeatureCollection;
}

export default function RouteMap({ route, styleUrl }: { route: RouteResult | null; styleUrl: string }) {
  const [track, setTrack] = useState<GeoJSONFeatureCollection>(EMPTY_FEATURE_COLLECTION);
  const cameraRef = useRef<CameraRef>(null);
  const { resolved } = useTheme();
  // MapLibre layer styles are native props, not Tailwind classes — read the
  // accent straight from tokens. cebuBlue (not enamel): this is a map
  // stroke, and cebuBlue is the accent the design system brightens for
  // dark-basemap legibility; enamel is a plate fill and would nearly vanish.
  const accent = TOKENS[resolved].cebuBlue;

  useEffect(() => {
    if (!route) {
      setTrack(EMPTY_FEATURE_COLLECTION);
      return;
    }
    let cancelled = false;
    buildTrackFeatureCollection(route, fetchRouteShape).then((fc) => {
      if (!cancelled) setTrack(fc);
    });
    return () => {
      cancelled = true;
    };
  }, [route]);

  const stops = buildStopsFeatureCollection(route);

  // initialViewState is, as the name says, *initial* — it does not
  // re-apply on later renders, so reframing to the selected route's track
  // has to be imperative via the CameraRef rather than a declarative prop.
  // No `bounds` prop exists on <Camera> in this library version (v11); that
  // is a v10 API and does not apply here.
  useEffect(() => {
    const bounds = boundsOf(track);
    if (bounds) {
      cameraRef.current?.fitBounds(
        bounds,
        { padding: { top: 40, right: 40, bottom: 40, left: 40 }, duration: 600 }
      );
    }
  }, [track]);

  return (
    <Map style={{ flex: 1 }} mapStyle={styleUrl}>
      <Camera ref={cameraRef} initialViewState={{ center: [123.89, 10.31], zoom: 13 }} />
      <GeoJSONSource id="route-track" data={toGeoJSON(track)}>
        <Layer
          id="route-track-line"
          type="line"
          paint={{ "line-color": accent, "line-width": 4 }}
          layout={{ "line-cap": "round", "line-join": "round" }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="route-stops" data={toGeoJSON(stops)}>
        <Layer
          id="route-stops-dots"
          type="circle"
          paint={{
            "circle-radius": 5,
            "circle-color": "#ffffff",
            "circle-stroke-width": 2,
            "circle-stroke-color": accent,
          }}
        />
      </GeoJSONSource>
      {route?.legs[0] && (
        <ViewAnnotation lngLat={[route.legs[0].fromStop.location.lon, route.legs[0].fromStop.location.lat]}>
          <View className="bg-surface-container-lowest border border-outline-variant rounded px-2 py-1">
            <Text className="text-on-surface text-xs font-sans">{route.legs[0].fromStop.stopName}</Text>
          </View>
        </ViewAnnotation>
      )}
    </Map>
  );
}
