"""
places.py — Cebu geographic grounding for the AI agent.

Two cheap, pre-LLM helpers that save tokens and keep answers on-topic:

1. Contextual fence: a hard bounding box for Metro Cebu. Messages that clearly
   name an out-of-scope location (Manila, Davao, Boracay, ...) are answered with
   a canned reply WITHOUT ever invoking the model.

2. Alias grounding: expand local shorthand to canonical names ("TC" ->
   "USC Talamban") before the agent runs, so its tools resolve the right stops.

Coordinates mirror the frontend hub list (approximate centroids).
"""

import re

# (min_lon, min_lat, max_lon, max_lat) — Metro Cebu contextual fence.
CEBU_BBOX = (123.82, 10.25, 123.96, 10.42)

# Canonical hub -> (lat, lon). Kept small and in sync with the UI's key hubs.
PLACES: dict[str, tuple[float, float]] = {
    "Ayala Center Cebu": (10.318, 123.905),
    "Cebu IT Park": (10.329, 123.907),
    "SM City Cebu": (10.312, 123.918),
    "SM Seaside City": (10.282, 123.882),
    "USC Talamban": (10.352, 123.912),
    "Colon Street": (10.297, 123.899),
    "Carbon Market": (10.293, 123.901),
    "Fuente Osmeña Circle": (10.310, 123.892),
    "Cebu South Bus Terminal": (10.298, 123.890),
    "Cebu North Bus Terminal": (10.328, 123.937),
    "Mandaue City": (10.323, 123.942),
}

# Lowercase alias -> canonical name. Longest aliases first matters for replace.
ALIASES: dict[str, str] = {
    "tc": "USC Talamban",
    "usc tc": "USC Talamban",
    "usc talamban": "USC Talamban",
    "talamban": "USC Talamban",
    "ayala": "Ayala Center Cebu",
    "ayala center": "Ayala Center Cebu",
    "it park": "Cebu IT Park",
    "itpark": "Cebu IT Park",
    "itp": "Cebu IT Park",
    "sm": "SM City Cebu",
    "sm city": "SM City Cebu",
    "sm cebu": "SM City Cebu",
    "seaside": "SM Seaside City",
    "sm seaside": "SM Seaside City",
    "srp": "SM Seaside City",
    "colon": "Colon Street",
    "carbon": "Carbon Market",
    "fuente": "Fuente Osmeña Circle",
    "south terminal": "Cebu South Bus Terminal",
    "csbt": "Cebu South Bus Terminal",
    "north terminal": "Cebu North Bus Terminal",
    "cnbt": "Cebu North Bus Terminal",
    "mandaue": "Mandaue City",
}

# Locations that are clearly NOT Cebu transit. Word-boundary matched so we don't
# trip on substrings. Triggers the canned fence reply (no LLM call).
OUT_OF_SCOPE_TERMS: tuple[str, ...] = (
    "manila", "makati", "quezon city", "qc", "pasig", "taguig", "bgc", "ncr",
    "davao", "cagayan de oro", "cdo", "iloilo", "bacolod", "dumaguete",
    "bohol", "tagbilaran", "boracay", "palawan", "puerto princesa",
    "tacloban", "leyte", "samar", "luzon", "mindanao", "baguio",
)

FENCE_REPLY = (
    "I can only help with public transit inside Metro Cebu "
    "(Cebu City, Mandaue, Lapu-Lapu, and Talisay). "
    "I don't have routes for {place}."
)


def in_bbox(lat: float, lon: float) -> bool:
    """True if a coordinate falls inside the Metro Cebu contextual fence."""
    min_lon, min_lat, max_lon, max_lat = CEBU_BBOX
    return min_lat <= lat <= max_lat and min_lon <= lon <= max_lon


def detect_out_of_scope(message: str) -> str | None:
    """
    Return the offending place name if the message clearly targets a location
    outside Cebu, else None. Word-boundary matched to avoid false positives.
    """
    text = message.lower()
    for term in OUT_OF_SCOPE_TERMS:
        if re.search(rf"\b{re.escape(term)}\b", text):
            return term.title()
    return None


def resolve_aliases(message: str) -> str:
    """
    Expand local shorthand to canonical hub names so the agent's tools resolve
    the right stops. Replaces whole words only; longest aliases first.
    """
    result = message
    for alias in sorted(ALIASES, key=len, reverse=True):
        canonical = ALIASES[alias]
        # Skip if the canonical form is already present (avoid double work).
        if canonical.lower() in result.lower():
            continue
        result = re.sub(rf"\b{re.escape(alias)}\b", canonical, result, flags=re.IGNORECASE)
    return result
