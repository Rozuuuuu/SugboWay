# SugboWay — Cebu Transit Navigator

SugboWay is a public-transport navigator for **Metro Cebu**. It answers the
question every Cebuano commuter actually asks — *"Asa ko mosakay, pila ang plete,
ug unsa kadugay?"* (Where do I ride, how much is the fare, and how long?) — for
jeepneys, modern e-jeeps, and buses.

It is built around two ideas:

- **The Spatial Brain** — a Go + PostGIS routing engine that computes real
  multi-leg journeys over a GTFS-style transit graph, with distance-based LTFRB
  fares and live congestion modelling.
- **The Cultural Bridge** — an AI guide and UI that don't just give directions,
  but teach you *how to ride*: when to say **"Lugar lang"** to get off, how to
  pass your **"Bayad"** forward, and which jeepney is aircon vs. traditional.

---

## Architecture

SugboWay is a monorepo of three services that talk over HTTP, backed by one
PostGIS database.

```
                         ┌──────────────────────────────┐
                         │   sugboway-web  (Next.js 16)  │
                         │   MapLibre GL · Tailwind v4   │  :3000
                         │   route search · live track   │
                         └───────────┬───────────┬───────┘
                                     │           │
                  /api/v1/route/*    │           │   /api/v1/chat
                  /api/v1/stops/*    │           │
                                     ▼           ▼
        ┌────────────────────────────────┐   ┌──────────────────────────────┐
        │  sugboway-routing-api (Go)     │   │  sugboway-ai-service (Python) │
        │  Fiber · PostGIS · Dijkstra    │   │  FastAPI · LangChain · Gemini │
        │  fares · congestion · shapes   │   │  RAG · contextual fence       │
        │            :8080               │   │            :8000              │
        └───────────────┬────────────────┘   └───────────────┬──────────────┘
                        │                                     │
                        └──────────────┬──────────────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │   PostgreSQL + PostGIS        │
                        │   stops · trips · stop_times  │
                        │   routes · route_shapes (geom)│
                        └──────────────────────────────┘
```

| Service | Stack | Port | Responsibility |
|---|---|---|---|
| **sugboway-web** | Next.js 16, React 19, Tailwind v4, MapLibre GL, PMTiles | `3000` | The UI: route search, the live map track, AI chat, rush-hour analytics, proximity etiquette alerts. |
| **sugboway-routing-api** | Go, Fiber, pgx, PostGIS | `8080` | The Spatial Brain: Dijkstra routing, LTFRB fares, BPR congestion, road shapes, nearby-stop spatial queries. |
| **sugboway-ai-service** | Python, FastAPI, LangChain, Google Gemini | `8000` | The conversational guide: a grounded RAG agent with a Cebu contextual fence and response caching. |

---

## Features

- **Multi-leg routing** over a transit graph (Dijkstra with transfer penalties),
  returning legs, stops, durations, and per-leg crowding.
- **Distance-based fares** following LTFRB rules, with student / senior / PWD
  20% discounts.
- **Live congestion** via a Bureau of Public Roads (BPR) cost model, adjusted
  for peak hours and rain.
- **Dynamic road track** — the selected route's geometry is pushed into a
  persistent MapLibre source with `setData()`, so switching routes updates the
  blue path *without* re-rendering the base map (no flicker).
- **Location-aware search** — a typeahead over ~45 Metro Cebu hubs with local
  aliases (`TC → USC Talamban`, `srp → SM Seaside`), each selection flying the
  camera to the spot and previewing nearby GTFS stops via `ST_DWithin`.
- **AI transit guide** — a Gemini agent grounded strictly on the routing tools,
  with a geographic **contextual fence** that answers out-of-Cebu questions
  without spending model tokens.
- **Proximity etiquette** — geolocation-driven "Lugar lang" / "Bayad po" cues
  fired within 200 m of your stop, with a soft coin-tap chime.
- **Offline-friendly map** — PMTiles vector tiles and an offline style fallback.
- **Warm, local design** — a sand-and-sea palette, Plus Jakarta Sans for UI,
  JetBrains Mono for route codes, and Cebu Blue (`#0056B3`) for the active track.

---

## Repository layout

```
SugboWay/
├── sugboway-web/             # Next.js front end
│   └── src/
│       ├── app/page.tsx      # main app shell + map + tabs
│       ├── components/route/ # RouteCard, PlaceDropdown, NavigationDrawer, …
│       ├── data/places.ts    # Metro Cebu hub list + fuzzy search
│       └── hooks/            # useProximityEtiquette, useCebuTime, useCebuWeather
├── sugboway-routing-api/     # Go + Fiber + PostGIS
│   ├── main.go               # server + routes
│   ├── domain/               # dijkstra, fare, bpr (pure logic + tests)
│   └── adapter/
│       ├── api/handler.go    # HTTP handlers
│       └── repository/       # postgres.go, schema.sql, seed_*.sql, migrations/
├── sugboway-ai-service/      # Python + FastAPI + LangChain
│   ├── main.py               # chat endpoint + rate limiting
│   └── agent/                # orchestrator, tools, prompt, places (fence)
├── parse_kmz.py              # KMZ/KML/GeoJSON → route_shapes SQL generator
├── data/routes/              # drop route source files here (see its README)
└── run-all.ps1               # boots the Go API + web app together (Windows)
```

---

## Getting started

### Prerequisites

- Node.js 20+ and npm
- Go 1.22+
- Python 3.10+
- A PostgreSQL database with the **PostGIS** extension
- A Google **Gemini API key** (for the AI service)

### Environment variables

**sugboway-routing-api**
```
DATABASE_URL=postgresql://user:pass@host/db   # PostGIS-enabled
PORT=8080                                      # optional, defaults to 8080
```

**sugboway-ai-service**
```
GEMINI_API_KEY=...           # mapped to GOOGLE_API_KEY automatically
DATABASE_URL=postgresql://...# same PostGIS DB (for stop embeddings/RAG)
ROUTING_API_URL=http://localhost:8080
REDIS_URL=...                # optional; falls back to in-memory cache
OPENWEATHER_KEY=...          # optional; weather context
```

**sugboway-web** (`.env.local`)
```
NEXT_PUBLIC_ROUTING_API_URL=http://localhost:8080
NEXT_PUBLIC_AI_API_URL=http://localhost:8000
NEXT_PUBLIC_WEATHER_API_KEY=...   # optional; live Cebu weather banner
```

### Run the database schema

```bash
psql "$DATABASE_URL" -f sugboway-routing-api/adapter/repository/schema.sql
psql "$DATABASE_URL" -f sugboway-routing-api/adapter/repository/seed_lptrp.sql
psql "$DATABASE_URL" -f sugboway-routing-api/adapter/repository/migrations/0002_lptrp_corridors.sql
```

### Run the services

On Windows, `run-all.ps1` boots the Go API and the web app in their own windows:

```powershell
./run-all.ps1
```

Or start each manually:

```bash
# Spatial Brain
cd sugboway-routing-api && go run main.go            # :8080

# Cultural Bridge (AI)
cd sugboway-ai-service && pip install -r requirements.txt && python main.py   # :8000

# Web
cd sugboway-web && npm install && npm run dev          # :3000
```

Open http://localhost:3000.

---

## Route shapes: making tracks follow the roads

The blue track a user sees comes from `route_shapes.geom` (a PostGIS
`LINESTRING`), served by `GET /api/v1/route/shape` via `ST_AsGeoJSON`. The 8
seeded corridors (incl. **13C** and **04L**) are coarse polylines — good enough
to demo the no-flicker track, but **not** yet snapped to every street.

To make tracks street-accurate, feed real geometry through the ingestion
pipeline (it never fabricates coordinates):

1. Drop a source file into [`data/routes/`](data/routes/) — a `.kmz`, `.kml`,
   or `.geojson` of the route LineStrings. Good public "ground truth" for Cebu:
   the community **Cebu Jeepney Route Guide**, the **Cebu Jeepneys Route Map**
   (Weebly), and **OpenStreetMap** PTv2 route relations (exportable via the
   Overpass API).
2. Generate SQL:
   ```bash
   python parse_kmz.py data/routes/corridors.kmz --out generated.sql --emit-snap
   ```
3. Review, then append into
   `sugboway-routing-api/adapter/repository/migrations/0002_lptrp_corridors.sql`
   and apply it.
4. *(Optional, highest fidelity)* load an `osm_nodes` table from OpenStreetMap
   and enable the commented `ST_ClosestPoint` block in that migration to snap
   every vertex to the nearest road node.

See [`migrations/README.md`](sugboway-routing-api/adapter/repository/migrations/README.md)
for the full workflow. Until real geometry is loaded, the frontend gracefully
falls back to a straight line between stops rather than showing a fake path.

---

## AI grounding & token efficiency

The AI guide is deliberately cheap and on-topic:

- **Contextual fence** (`agent/places.py`) — a hard Metro Cebu bounding box
  `(123.82, 10.25) … (123.96, 10.42)`. Messages that name an out-of-scope place
  (Manila, Davao, Boracay, …) get a canned reply and **never reach the model**.
- **Alias grounding** — local shorthand is expanded before the agent runs
  (`TC → USC Talamban`), so its tools resolve the right stops.
- **Module-level singletons** — `AgentExecutor` and the embeddings client are
  initialised once, avoiding cold-start latency per message.
- **Layered caching** — `functools.lru_cache` for embeddings plus a Redis (or
  in-memory) response cache keyed by message + time-of-day + weather.
- **Strict RAG** — the agent only explains verified tool output and refuses to
  invent routes, per the system prompt's grounding directives.

Rate limiting is 5 free queries/hour per IP, surfaced via the
`X-RateLimit-Remaining` response header.

---

## Design system

Warm and local rather than generic. Defined as Tailwind v4 tokens in
`sugboway-web/src/app/globals.css`:

- **Palette** — sand-tinted neutrals (light) and warm charcoal (dark), with
  **Cebu Blue `#0056B3`** as the single confident accent and a clay/terracotta
  support colour. Full light/dark theming.
- **Type** — Plus Jakarta Sans for display/UI, Inter for body, JetBrains Mono
  for route-code badges (e.g. `13C`, `04L`).

---

## Status & honest gaps

- **Routing/fares/congestion/AI**: implemented against the live Go + PostGIS +
  Gemini stack. The web app ships with mock routes so it renders even when the
  backend is offline, and swaps to live data once the API is reachable.
- **Road-snapped geometry**: pipeline-ready but pending a real route source
  file or a loaded `osm_nodes` table (see above). Stop *ordering* is already
  correct (`GROUP BY … ORDER BY MIN(stop_sequence)`).
- **Premium / quota**: the upgrade flow is a front-end demo, not a payment
  integration.

---

© 2026 SugboWay · Made in Cebu · Fares follow LTFRB rates.
