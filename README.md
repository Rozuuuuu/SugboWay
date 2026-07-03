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
- **Accounts & plans** — real, **email-verified** accounts via the Go API (a `users`
  table, bcrypt passwords, HS256 JWT). The Python AI service enforces a per-tier chat
  quota from the JWT's `tier` claim: **Guest 5/hr · Free 10/hr · Pro ₱149/mo (100/hr) ·
  Max ₱349/mo (unlimited)**. New users must verify their email before they can log in.
  Plan upgrades are a **front-end demo** (no real payments); only the chat quota is
  actually enforced. **Google sign-in** is supported too (a Google Identity Services
  ID token, verified server-side, that links to an existing account by email) — it's
  optional, enabled via `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
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
- A PostgreSQL database with the **PostGIS** extension (+ **pgvector** for the AI service)
- A Google **Gemini API key** (for the AI service)

### Database: Neon (recommended free host)

PostGIS is required, which rules out many free Postgres hosts.
[Neon](https://neon.tech) has a persistent free tier (no 30-day expiry) and
supports both `postgis` and `vector` extensions.

1. Create a Neon project and copy its **connection string** — it already
   includes `?sslmode=require`:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/DBNAME?sslmode=require
   ```
2. Set that as `DATABASE_URL` in **both** backend services (and your local
   `sugboway-ai-service/.env`). The extensions are created automatically by the
   schema/seed scripts (`CREATE EXTENSION IF NOT EXISTS postgis|vector`).
3. Deploy / start `sugboway-routing-api` — it **auto-runs migrations on boot**,
   so the fresh DB gets all tables, the road geometry, and the 54 routes/trips
   with no manual SQL.
4. Seed the base GTFS stops + embeddings once (calls the Gemini API, so it's
   kept out of the auto-migrator):
   ```bash
   python seed_runner.py
   ```

> Note: Neon autosuspends an idle database and wakes it on the next connection
> (~1s cold start). Supabase and Aiven also work (PostGIS-capable); only the
> connection string changes.

### Environment variables

See each service's `.env.example`. Summary:

**sugboway-routing-api** — `DATABASE_URL` (PostGIS), `PORT` (default 8080),
`RUN_MIGRATIONS` (default on). For accounts/auth: `AUTH_JWT_SECRET` (shared with the AI
service), `APP_BASE_URL` (web origin, for the post-verify redirect), `PUBLIC_API_URL`
(this API's public origin, for the email link), and SMTP (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). Optional: `ALLOWED_ORIGINS` (CORS allow-list,
comma-separated; defaults to `APP_BASE_URL` + localhost) and `WEATHER_API_KEY`
(weatherapi.com key, served via `GET /api/v1/weather` — kept server-side, never
shipped to the browser).

**sugboway-ai-service** — `DATABASE_URL` (same DB), `GEMINI_API_KEY`,
`ROUTING_API_URL`, `AUTH_JWT_SECRET` (**must match** the routing API — used to verify
the JWT and apply the per-tier chat quota), optional `ALLOWED_ORIGINS`, `REDIS_URL` /
`OPENWEATHER_KEY`.

**sugboway-web** (`.env.local`) — `NEXT_PUBLIC_ROUTING_API_URL`,
`NEXT_PUBLIC_AI_API_URL` (both build-time), optional `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
The weather key is no longer a web var — it moved to `WEATHER_API_KEY` on the routing API.

### Database migrations

The routing API **auto-applies migrations on startup** — on every Render deploy
or local `go run`. It embeds `schema.sql` + everything in
`adapter/repository/migrations/` into the binary and applies each pending file
exactly once (tracked in a `schema_migrations` table, guarded by a Postgres
advisory lock so concurrent instances are safe). Set `RUN_MIGRATIONS=false` to
opt out.

So a normal deploy needs **no manual SQL** — pushing the routing API is enough
to bring the DB up to date (e.g. the road-following route geometry in
`0003_weebly_real_shapes.sql` and `0004_weebly_routes_trips.sql`).

To apply a single file manually anyway (e.g. against a fresh DB before first
boot), use either:

```bash
python apply_migration.py sugboway-routing-api/adapter/repository/migrations/0003_weebly_real_shapes.sql --db "<EXTERNAL_DATABASE_URL>"
# or
psql "$DATABASE_URL" -f sugboway-routing-api/adapter/repository/migrations/0003_weebly_real_shapes.sql
```

> Base GTFS seed data + stop embeddings still come from `seed_runner.py`
> (it also calls the Gemini embeddings API), which is intentionally kept out of
> the auto-migrator.

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
- **Accounts / quota**: accounts and email verification are **real** (Go API + SMTP),
  and the per-tier chat quota is enforced server-side. The **plan upgrade** itself is a
  front-end-triggered demo — it sets the tier without a payment integration.

---

© 2026 SugboWay · Made in Cebu · Fares follow LTFRB rates.
