#!/usr/bin/env python3
"""
parse_kmz.py — Turn a KMZ / KML / GeoJSON of jeepney corridors into SQL that
populates `route_shapes` and links `trips.shape_id`.

Honest by design
----------------
This tool ONLY emits coordinates that exist in the source file. It never
invents or interpolates geometry. Routes in the source that have no usable
LineString are reported and skipped, so you always know what was (and wasn't)
imported.

Output matches the hand-written seed in
`sugboway-routing-api/adapter/repository/seed_lptrp.sql`:

    INSERT INTO route_shapes (shape_id, geom) VALUES
      ('shape_13c', ST_GeogFromText('SRID=4326;LINESTRING(123.9181 10.3705, ...)'))
    ON CONFLICT (shape_id) DO NOTHING;

    UPDATE trips SET shape_id = 'shape_13c'
      WHERE route_id = 'route_13c' AND shape_id IS NULL;

Usage
-----
    python parse_kmz.py SOURCE [--out FILE] [--mapping mapping.json] [--emit-snap]

    SOURCE          .kmz, .kml, or .geojson file containing LineString routes.
    --out FILE      Write SQL to FILE (default: stdout).
    --mapping FILE  JSON: { "<placemark name>": {"shape_id": "...", "route_id": "..."} }.
                    Anything not in the mapping falls back to a slug of the name.
    --emit-snap     Also append a commented, opt-in PostGIS snapping block that
                    snaps each vertex to the nearest OSM node via ST_ClosestPoint
                    (requires an `osm_nodes` table — see the migrations README).

Typical workflow
----------------
    1. python parse_kmz.py corridors.kmz --out generated_corridors.sql
    2. Review the SQL (counts are printed to stderr).
    3. Paste the reviewed inserts into
       sugboway-routing-api/adapter/repository/migrations/0002_lptrp_corridors.sql
       (see that folder's README.md for the full workflow).
    4. Apply with seed_runner.py or psql.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from typing import Iterable

# --------------------------------------------------------------------------- #
# Parsing helpers
# --------------------------------------------------------------------------- #

Coord = tuple[float, float]  # (lon, lat)


def _local(tag: str) -> str:
    """Strip the XML namespace: '{http://...}Placemark' -> 'Placemark'."""
    return tag.rsplit("}", 1)[-1]


def _slugify(name: str) -> str:
    """'04L - Lahug Loop' -> '04l_lahug_loop'. Stable, lowercase, alnum + '_'."""
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    return slug or "unnamed"


def _read_kml_text(path: str) -> str:
    """Return KML/XML text, transparently unzipping a .kmz container."""
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as zf:
            kml_names = [n for n in zf.namelist() if n.lower().endswith(".kml")]
            if not kml_names:
                raise ValueError(f"No .kml found inside KMZ: {zf.namelist()}")
            # 'doc.kml' is the conventional primary document; else take the first.
            primary = next((n for n in kml_names if n.lower().endswith("doc.kml")), kml_names[0])
            return zf.read(primary).decode("utf-8", errors="replace")
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def _parse_kml_coords(text: str) -> str:
    """KML coordinate string -> normalized 'lon,lat' tuples (alt dropped)."""
    return text


def routes_from_kml(text: str) -> Iterable[tuple[str, list[Coord]]]:
    """Yield (name, coords) for every Placemark containing a LineString."""
    root = ET.fromstring(text)
    for pm in root.iter():
        if _local(pm.tag) != "Placemark":
            continue
        name = ""
        coords_text = None
        for el in pm.iter():
            tag = _local(el.tag)
            if tag == "name" and el.text:
                name = el.text.strip()
            elif tag == "coordinates" and el.text:
                coords_text = el.text
        if not coords_text:
            continue  # not a line (could be a Point/Polygon) — skip honestly
        coords: list[Coord] = []
        for token in coords_text.split():
            parts = token.split(",")
            if len(parts) < 2:
                continue
            try:
                lon, lat = float(parts[0]), float(parts[1])
            except ValueError:
                continue
            coords.append((lon, lat))
        if len(coords) >= 2:
            yield (name or "unnamed", coords)


def routes_from_geojson(text: str) -> Iterable[tuple[str, list[Coord]]]:
    """Yield (name, coords) for every (Multi)LineString feature."""
    data = json.loads(text)
    features = data.get("features", []) if data.get("type") == "FeatureCollection" else [data]
    for feat in features:
        geom = feat.get("geometry") or {}
        props = feat.get("properties") or {}
        name = props.get("name") or props.get("Name") or props.get("route") or "unnamed"
        gtype = geom.get("type")
        if gtype == "LineString":
            lines = [geom.get("coordinates", [])]
        elif gtype == "MultiLineString":
            lines = geom.get("coordinates", [])
        else:
            continue
        for line in lines:
            coords = [(float(c[0]), float(c[1])) for c in line if len(c) >= 2]
            if len(coords) >= 2:
                yield (name, coords)


def extract_routes(path: str) -> list[tuple[str, list[Coord]]]:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".geojson" or ext == ".json":
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return list(routes_from_geojson(f.read()))
    # .kmz / .kml
    return list(routes_from_kml(_read_kml_text(path)))


# --------------------------------------------------------------------------- #
# SQL emission
# --------------------------------------------------------------------------- #

def _linestring_wkt(coords: list[Coord]) -> str:
    pts = ", ".join(f"{lon:.6f} {lat:.6f}" for lon, lat in coords)
    return f"SRID=4326;LINESTRING({pts})"


SNAP_TEMPLATE = """
-- ---------------------------------------------------------------------------
-- OPTIONAL: snap each shape vertex to the nearest OSM node (road-grid fidelity)
-- Requires an `osm_nodes(geom geometry(Point,4326))` table loaded from OSM.
-- Off by default because it needs OSM data present. Review before running.
-- ---------------------------------------------------------------------------
-- UPDATE route_shapes rs
-- SET geom = snapped.geom
-- FROM (
--   SELECT rs2.shape_id,
--          ST_MakeLine(
--            ST_ClosestPoint(n.geom, dp.geom) ORDER BY dp.path
--          )::geography AS geom
--   FROM route_shapes rs2,
--        LATERAL ST_DumpPoints(rs2.geom::geometry) AS dp
--   CROSS JOIN LATERAL (
--     SELECT geom FROM osm_nodes
--     ORDER BY osm_nodes.geom <-> dp.geom
--     LIMIT 1
--   ) AS n
--   GROUP BY rs2.shape_id
-- ) AS snapped
-- WHERE rs.shape_id = snapped.shape_id;
"""


def emit_sql(routes: list[tuple[str, list[Coord]]], mapping: dict, emit_snap: bool) -> str:
    inserts: list[str] = []
    updates: list[str] = []
    seen_shapes: set[str] = set()

    for name, coords in routes:
        entry = mapping.get(name, {})
        slug = _slugify(name)
        shape_id = entry.get("shape_id") or f"shape_{slug}"
        route_id = entry.get("route_id") or f"route_{slug}"
        if shape_id in seen_shapes:
            continue
        seen_shapes.add(shape_id)
        inserts.append(
            f"    ('{shape_id}', ST_GeogFromText('{_linestring_wkt(coords)}'))"
        )
        updates.append(
            f"UPDATE trips SET shape_id = '{shape_id}' "
            f"WHERE route_id = '{route_id}' AND shape_id IS NULL;"
        )

    out: list[str] = []
    out.append("-- Generated by parse_kmz.py - review before applying.")
    out.append(f"-- Corridors imported: {len(inserts)}")
    out.append("")
    if inserts:
        out.append("INSERT INTO route_shapes (shape_id, geom) VALUES")
        out.append(",\n".join(inserts))
        out.append("ON CONFLICT (shape_id) DO NOTHING;")
        out.append("")
        out.extend(updates)
        out.append("")
    if emit_snap:
        out.append(SNAP_TEMPLATE)
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser(description="KMZ/KML/GeoJSON -> route_shapes SQL generator.")
    ap.add_argument("source", help="Path to a .kmz, .kml, or .geojson file")
    ap.add_argument("--out", help="Write SQL here (default: stdout)")
    ap.add_argument("--mapping", help="JSON map of placemark name -> {shape_id, route_id}")
    ap.add_argument("--emit-snap", action="store_true", help="Append OSM ST_ClosestPoint snapping template")
    args = ap.parse_args()

    if not os.path.exists(args.source):
        print(f"error: source not found: {args.source}", file=sys.stderr)
        return 2

    mapping = {}
    if args.mapping:
        with open(args.mapping, "r", encoding="utf-8") as f:
            mapping = json.load(f)

    routes = extract_routes(args.source)
    if not routes:
        print("warning: no LineString routes found in source — nothing to emit.", file=sys.stderr)

    sql = emit_sql(routes, mapping, args.emit_snap)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(sql)
        print(f"Wrote {len(routes)} corridor(s) to {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(sql)

    # Report names so the user can eyeball coverage vs. their 40-corridor target.
    for name, coords in routes:
        print(f"  imported: {name!r} ({len(coords)} points)", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
