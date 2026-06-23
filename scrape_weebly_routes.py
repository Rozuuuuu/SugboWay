#!/usr/bin/env python3
"""
scrape_weebly_routes.py — Pull real, road-following jeepney geometry from the
community map at cebujeepneys.weebly.com and emit route_shapes SQL.

How it works
------------
Each route page (e.g. /13c.html) embeds a classic Google "My Maps" via an
`msid`. That msid still resolves, through a redirect, to a KMZ of hand-traced
polylines that follow the actual streets. For each requested route code we:

    1. GET https://cebujeepneys.weebly.com/<code>.html
    2. extract the msid
    3. GET https://maps.google.com/maps/ms?msid=<msid>&msa=0&output=kml  (a KMZ)
    4. save the KMZ under data/routes/ for reproducibility
    5. parse its LineStrings and keep the longest as the route's shape
       (the second-longest, if present, is the reverse direction)
    6. emit SQL that REPLACES shape_<code>.geom with the real geometry

This reuses the parser in parse_kmz.py — it only emits coordinates actually
found in the source, never fabricated geometry.

Attribution / licensing
------------------------
The source maps are published by cebujeepneys.weebly.com under
Creative Commons BY-NC 3.0 (attribution required, NON-COMMERCIAL use). Keep the
attribution in the generated migration and review the NC clause before any
commercial deployment.

Usage
-----
    python scrape_weebly_routes.py 13c 04l 17b 12l 62b 01b 03b 10m \
        --out sugboway-routing-api/adapter/repository/migrations/0003_weebly_real_shapes.sql
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

# Reuse the honest KML parser (LineString extraction, no fabrication).
from parse_kmz import routes_from_kml, _read_kml_text, _linestring_wkt

BASE = "https://cebujeepneys.weebly.com"
KML_ENDPOINT = "https://maps.google.com/maps/ms?msid={msid}&msa=0&output=kml"
DATA_DIR = Path("data/routes")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

MSID_RE = re.compile(r"msid=([0-9]{15,}\.[0-9a-fA-F]+)")

ATTRIBUTION = (
    "-- Geometry source: cebujeepneys.weebly.com community jeepney maps\n"
    "-- License: Creative Commons BY-NC 3.0 (attribution, NON-COMMERCIAL).\n"
    "-- Review the NC clause before commercial use.\n"
)


def _fetch(url: str, binary: bool = False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    return data if binary else data.decode("utf-8", "replace")


def extract_msid(route_code: str) -> str | None:
    try:
        html = _fetch(f"{BASE}/{route_code}.html")
    except urllib.error.URLError as e:
        print(f"  [{route_code}] page fetch failed: {e}", file=sys.stderr)
        return None
    m = MSID_RE.search(html)
    if not m:
        print(f"  [{route_code}] no embedded My Maps msid found", file=sys.stderr)
        return None
    return m.group(1)


def fetch_route_lines(route_code: str) -> list[tuple[str, list]]:
    """Return [(name, coords), ...] LineStrings for a route, longest first."""
    msid = extract_msid(route_code)
    if not msid:
        return []
    try:
        kmz = _fetch(KML_ENDPOINT.format(msid=msid), binary=True)
    except urllib.error.URLError as e:
        print(f"  [{route_code}] KMZ fetch failed: {e}", file=sys.stderr)
        return []

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    kmz_path = DATA_DIR / f"{route_code}.kmz"
    kmz_path.write_bytes(kmz)

    lines = list(routes_from_kml(_read_kml_text(str(kmz_path))))
    lines.sort(key=lambda nc: len(nc[1]), reverse=True)
    return lines


def emit_sql(results: dict[str, list[tuple[str, list]]]) -> str:
    out: list[str] = []
    out.append("-- ======================================================================")
    out.append("-- 0003_weebly_real_shapes.sql — road-following geometry (generated)")
    out.append("-- ======================================================================")
    out.append(ATTRIBUTION.rstrip())
    out.append("-- Replaces the coarse seed polylines for these routes with real,")
    out.append("-- street-traced geometry. Re-generate with scrape_weebly_routes.py.")
    out.append("")

    for code, lines in results.items():
        if not lines:
            out.append(f"-- {code}: no geometry extracted (skipped)")
            continue
        name, coords = lines[0]  # longest = primary direction
        shape_id = f"shape_{code}"
        route_id = f"route_{code}"
        out.append(f"-- {code}: '{name}' ({len(coords)} points)")
        out.append("INSERT INTO route_shapes (shape_id, geom) VALUES")
        out.append(f"    ('{shape_id}', ST_GeogFromText('{_linestring_wkt(coords)}'))")
        out.append("ON CONFLICT (shape_id) DO UPDATE SET geom = EXCLUDED.geom;")
        out.append(
            f"UPDATE trips SET shape_id = '{shape_id}' "
            f"WHERE route_id = '{route_id}' AND shape_id IS NULL;"
        )
        out.append("")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description="Scrape road-following jeepney geometry from cebujeepneys.weebly.com")
    ap.add_argument("routes", nargs="+", help="Route codes, e.g. 13c 04l 10m")
    ap.add_argument("--out", help="Write SQL here (default: stdout)")
    args = ap.parse_args()

    results: dict[str, list[tuple[str, list]]] = {}
    for code in args.routes:
        code = code.lower()
        print(f"[scrape] {code} ...", file=sys.stderr)
        lines = fetch_route_lines(code)
        results[code] = lines
        for name, coords in lines:
            print(f"  kept: {name!r} ({len(coords)} pts)", file=sys.stderr)

    sql = emit_sql(results)
    if args.out:
        Path(args.out).write_text(sql, encoding="utf-8")
        print(f"Wrote {sum(1 for v in results.values() if v)} route(s) to {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(sql)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
