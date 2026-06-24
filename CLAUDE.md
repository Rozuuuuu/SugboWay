# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SugboWay is a public-transport navigator for Metro Cebu. It is a **monorepo of three
services** that talk over HTTP, backed by a single PostgreSQL + PostGIS database. Read
[README.md](README.md) for product context and the full deployment story; this file
covers what you need to be productive in the code.

| Service | Dir | Stack | Port |
|---|---|---|---|
| Web UI ("Cultural Bridge") | `sugboway-web/` | Next.js 16, React 19, Tailwind v4, MapLibre GL, PMTiles | 3000 |
| Routing API ("Spatial Brain") | `sugboway-routing-api/` | Go 1.21, Fiber, pgx, PostGIS | 8080 |
| AI service | `sugboway-ai-service/` | Python, FastAPI, LangChain, Google Gemini | 8000 |

The web app calls the Go and Python services **directly** over HTTP (via
`NEXT_PUBLIC_ROUTING_API_URL` / `NEXT_PUBLIC_AI_API_URL`). There are no Next.js API
routes — do not add server-side proxy routes without reason.

## Two docs that will mislead you — read this first

- **`SKILLS.md` is an aspirational blueprint, not the implementation.** It describes
  React Native, Zustand, Supabase, WebSocket crowding, Anthropic Claude, GTFS-RT, etc.
  **None of that is built.** The real app is a Next.js web app using local React state +
  custom hooks; the AI uses **Google Gemini** (`gemini-2.5-flash`), not Claude. When in
  doubt, trust the actual code and `README.md` over `SKILLS.md`.
- **`sugboway-web/AGENTS.md` (also `CLAUDE.md` there) warns the bundled Next.js 16 has
  breaking changes vs. older Next.** Before writing non-trivial Next.js/React code in
  `sugboway-web/`, consult `sugboway-web/node_modules/next/dist/docs/` rather than
  relying on memory of older Next.js APIs.

## Commands

Run each service from its own directory.

**Web** (`sugboway-web/`)
- Dev server: `npm run dev` (`:3000`)
- Production build: `npm run build`
- Lint: `npm run lint` (ESLint via `eslint-config-next`)
- There is **no test runner and no `npm test` script** in the web app — don't assume one exists.

**Routing API** (`sugboway-routing-api/`)
- Run: `go run main.go` (`:8080`; auto-applies DB migrations on boot)
- Build binary: `go build`
- All tests: `go test ./...`
- Just the routing core (where the meaningful tests live): `go test ./domain/...`
- A single test: `go test ./domain/ -run TestFareCalculation -v`

**AI service** (`sugboway-ai-service/`)
- Install: `pip install -r requirements.txt`
- Run: `python main.py` (`:8000`, uvicorn with reload)
- Phase verification / smoke scripts live in `scripts/` (e.g. `python scripts/verify_phase4.py`);
  there is no formal pytest suite.

**Both Go API + web together (Windows):** `./run-all.ps1` from the repo root spawns each
in its own PowerShell window. Note it hardcodes `C:\Program Files\Go\bin\go.exe`.

## Architecture

### Hexagonal (ports & adapters) — applied in both Go and TypeScript

The core design rule, enforced in both backends: **routing/fare/spatial logic is pure
and isolated from I/O, and the AI never computes routes — it only narrates verified tool
output.**

- **Go** (`sugboway-routing-api/`):
  - `domain/` — pure logic with unit tests: `dijkstra.go` (multi-leg routing with
    transfer penalties), `fare.go` (LTFRB distance fares + student/senior/PWD discounts),
    `bpr.go` (Bureau of Public Roads congestion model), `models.go`, `ports.go`.
  - `adapter/api/handler.go` — Fiber HTTP handlers.
  - `adapter/repository/` — `postgres.go` (pgx pool, PostGIS spatial queries),
    `schema.sql`, `seed_*.sql`, and `migrations/`.
  - `main.go` wires it together: repo → `NewDijkstraRoutingEngine(repo)` → handlers →
    Fiber server. Endpoints are under `/api/v1` (`/route/search`, `/route/shape`,
    `/stops/nearby`, `/routes`, `/congestion`, …) plus `/health`.
- **Web** (`sugboway-web/src/domain/`): mirrors the same ports in TypeScript
  (`ports.ts`, `fare.ts`, `crowding.ts`, `types.ts`). `ports.ts` documents the
  anti-hallucination contract the AI must honor. UI lives in `src/app/page.tsx` (the
  shell + map + tabs), `src/components/route/`, `src/hooks/` (e.g.
  `useProximityEtiquette`, `useCebuTime`, `useCebuWeather`), and `src/data/places.ts`
  (the ~45 Metro Cebu hubs + alias fuzzy-search).

### Database & migrations (important)

The routing API **auto-applies migrations on every boot** (`RunMigrations` in
`adapter/repository/migrate.go`): it embeds `schema.sql` + everything in
`adapter/repository/migrations/` into the binary, applies each pending file exactly once
(tracked in `schema_migrations`, guarded by a Postgres advisory lock). So a deploy needs
no manual SQL. Set `RUN_MIGRATIONS=false` to skip.

**Exception:** base GTFS seed data + stop embeddings are intentionally kept out of the
auto-migrator because they call the Gemini embeddings API. Seed those once with
`python seed_runner.py`.

Root-level Python helpers: `parse_kmz.py` (KMZ/KML/GeoJSON → `route_shapes` SQL),
`apply_migration.py` (apply one migration file against a DB URL), `seed_runner.py`.

PostGIS (and pgvector for the AI service) is required — many free Postgres hosts won't
work. README recommends Neon.

### Deployment (live)

All three services are deployed and running on **Render**; the database is **Neon**
(serverless PostgreSQL + PostGIS + pgvector). There is no `render.yaml`, Dockerfile, or
CI in the repo — Render builds each service directly from its subdirectory, and env vars
are configured in the Render dashboard (not committed). See each service's `.env.example`.

| Service | Host | Build / start | Required env |
|---|---|---|---|
| `sugboway-routing-api` | Render | `go build` → run binary | `DATABASE_URL` (Neon), `PORT` (Render injects), `RUN_MIGRATIONS` |
| `sugboway-ai-service` | Render | `pip install -r requirements.txt` → `python main.py` (uvicorn) | `DATABASE_URL` (same Neon DB), `GEMINI_API_KEY`, `ROUTING_API_URL` (the deployed routing API), optional `REDIS_URL` / `OPENWEATHER_KEY` |
| `sugboway-web` | Render | `npm run build` → `npm start` | `NEXT_PUBLIC_ROUTING_API_URL`, `NEXT_PUBLIC_AI_API_URL` (the deployed service URLs), optional `NEXT_PUBLIC_WEATHER_API_KEY` |
| PostgreSQL/PostGIS | Neon | — | shared `DATABASE_URL` used by both backends |

Deploy notes:
- The web app's `NEXT_PUBLIC_*` URLs are **baked in at build time** — if a backend URL
  changes, the web service must be **rebuilt**, not just restarted.
- Pushing the routing API is enough to bring the DB schema up to date: it auto-runs
  migrations on boot (see above). Seed data (`seed_runner.py`) is still a one-off.
- Neon autosuspends an idle database and wakes on the next connection (~1s cold start),
  so the first request after idle may be slow.

### AI service flow (`agent/orchestrator.py` → `process_message`)

The pipeline is built to be cheap and strictly on-topic, in this order:
1. **Contextual fence** (`agent/places.py`, `detect_out_of_scope`) — a hard Metro Cebu
   bounding box. Out-of-scope places (Manila, Davao, …) get a canned reply and **never
   reach the model**.
2. **Alias grounding** — local shorthand expanded before the agent runs (`TC → USC Talamban`).
3. **Layered caching** — Redis if available, else an in-memory TTL cache, keyed by
   normalized message + time-of-day + weather category.
4. **Agent invoke** — a LangChain tool-calling agent (Gemini 2.5 Flash, `max_iterations=3`)
   restricted to four tools in `agent/tools.py`: `get_route_options`, `calculate_fare`,
   `check_congestion`, `verify_stop`. The `AgentExecutor` is a module-level singleton.

The chat endpoint (`main.py`) rate-limits to **5 requests/hour per IP**, surfaced via
`X-RateLimit-Remaining`. `GEMINI_API_KEY` is auto-mapped to `GOOGLE_API_KEY` for
langchain-google-genai.

### Web ⇄ backend resilience

The web app ships with **mock routes** so it renders even when the backend is offline,
and swaps to live data once the routing API is reachable. The selected route's geometry
is pushed into a persistent MapLibre source via `setData()` so switching routes updates
the track without re-rendering the base map (no flicker). When real road geometry isn't
loaded, the frontend falls back to a straight line between stops rather than faking a path.

## Conventions

- **TypeScript/React:** functional components with arrow syntax; ES module `import`
  (never CommonJS `require`); `camelCase` for files/variables, `PascalCase` for
  components. **State is plain local React state + custom hooks — there is no Zustand or
  other global store**, despite what `SKILLS.md` claims.
- **Design tokens** live in `sugboway-web/src/app/globals.css` (Tailwind v4): sand/sea
  palette, Cebu Blue `#0056B3` as the single accent, Plus Jakarta Sans (UI), JetBrains
  Mono (route-code badges). Full light/dark theming.
- **Go:** keep `domain/` free of HTTP/DB types; new spatial or fare behavior belongs in
  `domain/` with a test alongside it, surfaced through a handler in `adapter/api/`.
