# SugboWay — Full-Stack Development Skills Blueprint

> A production-grade Cebu transit navigator combining real-time GTFS routing, AI-powered assistance, and offline-first mobile UX. This document defines every technical competency, toolchain decision, data contract, and integration pattern required to ship a complete, polished app.

---

## Table of Contents

1. [Project Architecture Overview](#1-project-architecture-overview)
2. [Geospatial Data Engineering](#2-geospatial-data-engineering)
3. [Spatial Backend & Routing Engine](#3-spatial-backend--routing-engine)
4. [AI & LLM Engineering (Anti-Hallucination)](#4-ai--llm-engineering-anti-hallucination)
5. [Predictive Analytics & Congestion Modeling](#5-predictive-analytics--congestion-modeling)
6. [Mobile & Frontend Application](#6-mobile--frontend-application)
7. [Offline-First & Edge Capabilities](#7-offline-first--edge-capabilities)
8. [DevOps, Infrastructure & CI/CD](#8-devops-infrastructure--cicd)
9. [Testing & Quality Assurance](#9-testing--quality-assurance)
10. [Accessibility, Localization & Compliance](#10-accessibility-localization--compliance)
11. [Data Contracts & API Specifications](#11-data-contracts--api-specifications)
12. [Security & Privacy](#12-security--privacy)

---

## 1. Project Architecture Overview

### System Design Philosophy

SugboWay follows a **Hexagonal (Ports & Adapters)** architecture so that core routing logic is fully decoupled from data sources, UI frameworks, and AI models. Every external dependency (OSM, LLM APIs, GTFS feeds) connects through a well-defined adapter — making the system testable, swappable, and resilient to third-party changes.

```
┌─────────────────────────────────────────────────────┐
│                   CLIENT LAYER                      │
│   React Native (iOS/Android) + Next.js (Web PWA)   │
└───────────────────┬─────────────────────────────────┘
                    │ REST / WebSocket / gRPC
┌───────────────────▼─────────────────────────────────┐
│                   API GATEWAY                       │
│      Kong / Nginx · Auth (Supabase / JWT)          │
└──────┬──────────────┬──────────────┬────────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼──────┐ ┌────▼───────────┐
│  Routing    │ │  AI / RAG  │ │  Analytics &   │
│  Service    │ │  Service   │ │  Prediction    │
│  (Go/Rust)  │ │  (Python)  │ │  Service       │
└──────┬──────┘ └─────┬──────┘ └────┬───────────┘
       │              │              │
┌──────▼──────────────▼──────────────▼───────────────┐
│              DATA LAYER                             │
│  PostgreSQL/PostGIS · Redis · Vector DB (pgvector) │
│  S3-compatible Object Store (GTFS, Tiles, Models)  │
└─────────────────────────────────────────────────────┘
```

### Tech Stack Decisions (Rationale Included)

| Layer | Choice | Why |
|---|---|---|
| Mobile | React Native + Expo | Cross-platform, large ecosystem, Expo EAS build pipeline |
| Web | Next.js 14 (App Router) | SSR for SEO, RSC for performance, same codebase as mobile components |
| Routing API | Go (Fiber framework) | Low latency, goroutine concurrency for simultaneous route searches |
| AI Service | Python (FastAPI) | Best LLM/ML library support (LangChain, Transformers, FAISS) |
| Database | PostgreSQL 16 + PostGIS 3.4 | Industry-standard for geospatial; ST_DWithin, ST_Distance native |
| Cache | Redis 7 (via Upstash) | Sub-millisecond route caching; pub/sub for real-time crowding updates |
| Vector Store | pgvector (PostgreSQL extension) | Keeps embeddings co-located with relational GTFS data |
| Auth | Supabase Auth | Row-level security, social login, free tier |
| Map Tiles | MapTiler / self-hosted PMTiles | Offline-capable vector tiles in Protobuf format |
| CI/CD | GitHub Actions + Docker | Reproducible builds, automated test gates |

---

## 2. Geospatial Data Engineering

### 2.1 GTFS Standardization

**Goal:** Compile a complete, valid GTFS feed representing Cebu's 66+ legacy jeepney routes and 40 new LPTRP modern corridors.

**Required Files & Schemas:**

```
gtfs/
├── agency.txt          # Operator registry (LTFRB region code, contact)
├── stops.txt           # stop_id, stop_name, stop_lat, stop_lon, wheelchair_boarding
├── routes.txt          # route_id, route_short_name, route_long_name, route_type (3=bus/jeep)
├── trips.txt           # trip_id, route_id, service_id, shape_id, direction_id
├── stop_times.txt      # trip_id, arrival_time, departure_time, stop_sequence
├── shapes.txt          # shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence
├── calendar.txt        # Weekday/weekend service schedules
├── calendar_dates.txt  # Holiday overrides (Cebu City Fiesta, Holy Week, etc.)
├── fare_attributes.txt # fare_id, price, currency_type (PHP), payment_method
└── fare_rules.txt      # Maps fare_id to route_id with origin/destination zones
```

**Skills Required:**
- Feed validation with `gtfs-validator` (Google's canonical tool) — target zero ERRORS, minimize WARNINGS
- Use `gtfs-realtime` Protobuf extensions for live vehicle positions when LTFRB exposes AVL data
- Write a Python ETL pipeline (`pandas` + `shapely`) to normalize raw route data from LTFRB PDF bulletins into GTFS-compliant CSVs
- Implement a GTFS diff/versioning system (semantic versioning: `v2025.07.01`) to track route changes without full reingestion

**Data Sources & Collection Strategy:**

| Source | Format | Reliability | Action |
|---|---|---|---|
| LTFRB LPTRP bulletins | PDF | High (official) | PDF-to-CSV parser |
| Cebu City Planning Office GIS | Shapefile | Medium | GDAL conversion |
| OpenStreetMap Cebu relations | OSM XML | Community | Overpass API pull |
| Crowdsourced driver interviews | Field notes | Low | GPS trace + manual entry |
| Google Maps (reference only) | Web | High | Cross-validation only (no scraping) |

**Stop Coordinate Gathering for Informal Stops:**
- Use OSMAnd or OsmAnd+ on Android to record GPS waypoints at physical stops
- Implement a community contribution flow: users can flag/correct stop positions in-app (moderated queue)
- Store raw GPS traces in PostGIS as `LINESTRING` geometries; snap to nearest OSM road node using `ST_ClosestPoint`

### 2.2 OpenStreetMap Integration

**OSM-to-GTFS Map Matching Pipeline:**

```python
# Pseudocode for shape geometry snapping
def snap_shape_to_osm(shape_coords: list[tuple]) -> list[tuple]:
    """
    Uses OSRM Match API to snap raw GPS traces to OSM road network.
    Returns corrected coordinates aligned to drivable roads.
    """
    osrm_url = "http://router.project-osrm.org/match/v1/driving/"
    coords_str = ";".join(f"{lon},{lat}" for lat, lon in shape_coords)
    response = requests.get(f"{osrm_url}{coords_str}?overview=full&geometries=geojson")
    return response.json()["matchings"][0]["geometry"]["coordinates"]
```

**Tools:**
- `gtfstoosm` — export GTFS stops as OSM nodes for community editing
- `Osmosis` — filter large OSM planet files to Cebu bounding box (`bbox: 9.9,123.7,10.5,124.1`)
- `pyrosm` — parse OSM PBF files in Python for road network graph construction
- OSRM (Open Source Routing Machine) — self-hosted for map-matching and driving distances

### 2.3 Tile Server for Offline Maps

- Use `tippecanoe` to convert GeoJSON route shapes into MBTiles
- Serve via `tileserver-gl` or embed as PMTiles in the mobile app bundle
- Tile zoom levels: z10 (city overview) to z17 (street-level walking directions)
- Style with MapLibre GL JS (open-source Mapbox fork) — custom Cebu color theme

---

## 3. Spatial Backend & Routing Engine

### 3.1 PostgreSQL/PostGIS Schema

```sql
-- Core stops table with spatial index
CREATE TABLE stops (
    stop_id       TEXT PRIMARY KEY,
    stop_name     TEXT NOT NULL,
    location      GEOGRAPHY(POINT, 4326) NOT NULL,  -- WGS84
    is_terminal   BOOLEAN DEFAULT FALSE,
    has_shelter   BOOLEAN DEFAULT FALSE,
    wheelchair_boarding SMALLINT DEFAULT 0
);
CREATE INDEX idx_stops_location ON stops USING GIST(location);

-- Spatial query: nearest stops within 500m
SELECT stop_id, stop_name,
       ST_Distance(location, ST_MakePoint($lon, $lat)::GEOGRAPHY) AS dist_meters
FROM stops
WHERE ST_DWithin(location, ST_MakePoint($lon, $lat)::GEOGRAPHY, 500)
ORDER BY dist_meters
LIMIT 10;

-- Routes with embedded shape geometry
CREATE TABLE route_shapes (
    shape_id  TEXT PRIMARY KEY,
    route_id  TEXT REFERENCES routes(route_id),
    geom      GEOGRAPHY(LINESTRING, 4326) NOT NULL
);
CREATE INDEX idx_shapes_geom ON route_shapes USING GIST(geom);
```

### 3.2 Routing Graph Construction

**Graph Model:**
- **Nodes:** Every GTFS stop + OSM pedestrian nodes near stops (for walking legs)
- **Edges — Transit:** `(stop_A, stop_B, route_id, weight)` where weight = travel time in seconds
- **Edges — Walking:** `(stop_A, osm_node, weight)` where weight = Haversine distance / 1.4 m/s
- **Edges — Transfer:** `(stop_A, stop_B, TRANSFER, weight)` where weight = transfer penalty (default 5 min)

**Implementation (Go):**

```go
type Graph struct {
    Nodes map[string]*Node
    Edges map[string][]*Edge
}

type Edge struct {
    To          string
    RouteID     string
    WeightSecs  float64
    EdgeType    EdgeType  // TRANSIT | WALKING | TRANSFER
}

// Modified Dijkstra with transfer penalties
func (g *Graph) FindRoute(origin, dest string, prefs RoutePrefs) *RouteResult {
    pq := &PriorityQueue{}
    heap.Push(pq, &Item{node: origin, cost: 0, transfers: 0})
    
    for pq.Len() > 0 {
        curr := heap.Pop(pq).(*Item)
        for _, edge := range g.Edges[curr.node] {
            newCost := curr.cost + edge.WeightSecs
            if edge.EdgeType == TRANSFER {
                newCost += float64(prefs.TransferPenaltySecs)  // configurable
            }
            // ... standard Dijkstra relaxation
        }
    }
}
```

**Route Preference Inputs:**
- `minimize: "transfers" | "time" | "fare" | "walking"` — user-selectable
- `max_walking_meters: int` — default 500m, configurable
- `accessibility_mode: bool` — excludes non-wheelchair-accessible stops
- `avoid_routes: []string` — user blacklist (e.g., known overcrowded routes)

### 3.3 Fare Computation Engine

```python
class CebuFareCalculator:
    BASE_FARE_PHP = 13.00
    SURCHARGE_PER_KM = 1.80  # per LTFRB Order 2023
    STUDENT_DISCOUNT = 0.20   # 20% discount
    PWD_DISCOUNT = 0.20
    SENIOR_DISCOUNT = 0.20

    def calculate(self, distance_km: float, passenger_type: str, transfers: int) -> FareBreakdown:
        base = self.BASE_FARE_PHP
        if distance_km > 4.0:  # surcharge kicks in after 4km
            base += (distance_km - 4.0) * self.SURCHARGE_PER_KM
        
        discount = getattr(self, f"{passenger_type.upper()}_DISCOUNT", 0.0)
        discounted = base * (1 - discount)
        total = discounted * (transfers + 1)  # one fare per vehicle boarded
        
        return FareBreakdown(
            base_fare=base,
            discount_applied=discount,
            total_fare=round(total, 2),
            per_leg=[round(discounted, 2)] * (transfers + 1)
        )
```

**Edge Cases to Handle:**
- Express routes (e.g., SM Seaside–Ayala) may have different base fares
- Free transfer zones (if LTFRB implements intermodal terminals)
- Cash-only vs. Beep card fares (if Beep integration is added)

---

## 4. AI & LLM Engineering (Anti-Hallucination)

### 4.1 RAG Architecture (Full Pipeline)

```
User Query (text or voice)
        │
        ▼
[Query Preprocessing]
 - Language detection (Filipino/Cebuano/English)
 - Named entity extraction (place names, landmarks)
 - Intent classification (route_query | fare_query | schedule_query | general)
        │
        ▼
[Retrieval Layer]
 - Semantic search via pgvector (embedded stop names, route descriptions)
 - Keyword search via PostgreSQL full-text search (tsvector on stop_name, route_long_name)
 - Hybrid re-ranking (RRF: Reciprocal Rank Fusion)
        │
        ▼
[Context Assembly]
 - Top-K retrieved GTFS records formatted as structured context
 - Current crowding scores injected (from Redis)
 - User location + time-of-day appended
        │
        ▼
[LLM Generation — Claude claude-sonnet-4-20250514]
 - System prompt enforces: "Only answer from provided context. If unsure, say so."
 - Output: natural language directions + structured JSON for UI rendering
        │
        ▼
[Post-Processing]
 - Validate route IDs in response exist in GTFS database
 - Hallucination check: reject any stop/route name not in retrieved context
 - Format for TTS if voice mode is active
```

**Embedding Strategy:**
```python
# Generate embeddings for all stop names and route descriptions
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
# Multilingual model handles Cebuano, Filipino, English

def embed_stop(stop: Stop) -> list[float]:
    text = f"{stop.name} {stop.aliases} near {stop.landmark_hints}"
    return model.encode(text).tolist()
```

**Alias Database (Critical for Cebu):**
```json
{
  "IT Park": ["Cebu IT Park", "Lahug IT Park", "Asiatown IT Park"],
  "SM Seaside": ["SM City Seaside", "Seaside Cebu", "SRP SM"],
  "Carbon Market": ["Carbon", "Merkado sa Carbon", "Cebu Public Market"],
  "Colon": ["Colon Street", "Calle Colon", "Downtown Cebu"]
}
```

### 4.2 Agentic Tool-Use Workflow

Define structured tools the LLM can call:

```python
tools = [
    {
        "name": "find_route",
        "description": "Find jeepney/bus routes between two locations in Cebu",
        "parameters": {
            "origin": {"type": "string", "description": "Starting location or stop name"},
            "destination": {"type": "string", "description": "Destination location or stop name"},
            "preferences": {"type": "object", "properties": {
                "minimize": {"enum": ["time", "transfers", "fare", "walking"]},
                "passenger_type": {"enum": ["regular", "student", "senior", "pwd"]}
            }}
        }
    },
    {
        "name": "get_stop_info",
        "description": "Get current crowding, next departures, and walking distance for a stop",
        "parameters": {
            "stop_id": {"type": "string"},
            "user_lat": {"type": "number"},
            "user_lon": {"type": "number"}
        }
    },
    {
        "name": "calculate_fare",
        "description": "Calculate the exact fare for a given route and passenger type",
        "parameters": {
            "route_ids": {"type": "array", "items": {"type": "string"}},
            "passenger_type": {"enum": ["regular", "student", "senior", "pwd"]}
        }
    }
]
```

### 4.3 Multilingual NLP for Cebuano/Filipino

- Use `fastText` language detection (lid.176.bin model) to auto-detect query language
- Maintain a Cebuano transit lexicon: `sakay` (ride), `lugsong` (get off), `plete` (fare), `jeep` (jeepney)
- Fallback to English internally for routing logic; respond in detected language
- Test with common Cebuano phrasings: *"Pila ang plete padulong SM?"*, *"Hain ang jeep paadto Carbon?"*

### 4.4 Edge AI for Offline Voice Navigation

| Component | Tool | Model Size | Use Case |
|---|---|---|---|
| Speech-to-Text | Whisper (tiny.en / small multilingual) | 75MB / 244MB | Voice query input |
| Text-to-Speech | Piper TTS | ~50MB per voice | Turn-by-turn audio directions |
| Intent Classification | ONNX-exported DistilBERT | ~65MB | Offline query routing |
| Stop Name Matching | BM25 (pure Python) | <1MB | Fuzzy stop name lookup |

**On-device inference via React Native:**
- Use `react-native-whisper` (Whisper.cpp bindings) for STT
- Use `expo-speech` as fallback TTS (online) or custom Piper binding (offline)
- Trigger offline mode automatically when `NetInfo.isConnected === false`

---

## 5. Predictive Analytics & Congestion Modeling

### 5.1 Bureau of Public Roads (BPR) Function

The BPR function models how travel time increases as road volume approaches capacity:

```python
def bpr_travel_time(
    free_flow_time: float,  # seconds at zero traffic
    volume: float,           # vehicles per hour on segment
    capacity: float,         # road segment capacity (veh/hr)
    alpha: float = 0.15,    # BPR calibration constant
    beta: float = 4.0       # BPR calibration exponent
) -> float:
    """Returns congested travel time in seconds."""
    return free_flow_time * (1 + alpha * (volume / capacity) ** beta)

# Integration into routing weight:
def congestion_weight(edge: Edge, current_hour: int) -> float:
    volume = get_current_volume(edge.road_segment_id, current_hour)
    capacity = edge.road_capacity
    return bpr_travel_time(edge.free_flow_secs, volume, capacity)
```

**Calibration for Cebu:**
- Free-flow speeds: Expressways 80 kph, National roads 40 kph, Barangay roads 20 kph
- Peak hours: 7–9 AM and 5–8 PM — apply α=0.15, β=4 (standard urban BPR)
- Off-peak: α=0.10, β=3 (lighter penalty)

### 5.2 Demand & Crowding Forecasting

**Data Pipeline:**

```
Historical Ridership Data (CSV from operators / LTFRB)
        │
        ▼
Feature Engineering:
  - Hour of day (0–23)
  - Day of week (0=Monday)
  - Is holiday (binary)
  - Week of month
  - Special event nearby (binary — Sinulog, Pasko, etc.)
        │
        ▼
Model: LightGBM regression (fast, interpretable, small footprint)
  Target: Passenger Volume (PV) per route per 15-min interval
        │
        ▼
Output: Crowding score (0.0–1.0) per route/stop/time
  0.0–0.3 = Comfortable (green)
  0.3–0.6 = Moderate (yellow)
  0.6–0.8 = Crowded (orange)
  0.8–1.0 = Packed — suggest alternative (red)
```

**Real-Time Override:**
- If operators provide AVL (Automatic Vehicle Location) data via GTFS-RT, use actual vehicle positions
- Crowding scores pushed to Redis with 5-minute TTL
- WebSocket channel per route: clients subscribe and receive live crowding updates

### 5.3 Peak Period Detection

```python
CEBU_PEAK_WINDOWS = [
    {"label": "Morning Rush", "start": time(7, 0), "end": time(9, 0), "multiplier": 1.8},
    {"label": "Lunch Rush",   "start": time(11,30),"end": time(13,0),"multiplier": 1.3},
    {"label": "Evening Rush", "start": time(17, 0), "end": time(20, 0),"multiplier": 2.0},
]

SPECIAL_EVENTS = [
    {"name": "Sinulog Grand Parade", "date": "2026-01-18", "affected_routes": ["01A","02B","05C"]},
    {"name": "UAAP Games (USC)", "date": "varies", "affected_routes": ["04A","08B"]},
]
```

---

## 6. Mobile & Frontend Application

### 6.1 Screen Architecture (React Native + Expo Router)

```
app/
├── (tabs)/
│   ├── index.tsx          # Home — search bar, quick routes, nearby stops
│   ├── explore.tsx        # Map view — live route shapes, stops, crowding
│   ├── saved.tsx          # Saved routes, favorite stops
│   └── settings.tsx       # Passenger type, language, offline mode toggle
├── route/
│   ├── [id].tsx           # Route detail — stops list, schedule, fare
│   └── result.tsx         # Route search results — ranked options
├── navigation/
│   └── active.tsx         # Turn-by-turn navigation mode
└── _layout.tsx            # Root layout, auth gate, theme provider
```

### 6.2 Map Component (MapLibre React Native)

```tsx
import MapLibreGL from '@maplibre/maplibre-react-native';

const RouteMap: React.FC<{ route: RouteResult }> = ({ route }) => {
  return (
    <MapLibreGL.MapView style={styles.map} styleURL={CEBU_MAP_STYLE_URL}>
      <MapLibreGL.Camera
        zoomLevel={14}
        centerCoordinate={[route.origin.lon, route.origin.lat]}
        animationDuration={800}
      />
      
      {/* Route shape */}
      <MapLibreGL.ShapeSource id="route-shape" shape={route.geoJson}>
        <MapLibreGL.LineLayer
          id="route-line"
          style={{ lineColor: ROUTE_COLORS[route.routeId], lineWidth: 4 }}
        />
      </MapLibreGL.ShapeSource>

      {/* Stop markers */}
      {route.stops.map(stop => (
        <MapLibreGL.MarkerView key={stop.id} coordinate={[stop.lon, stop.lat]}>
          <StopMarker stop={stop} crowding={stop.crowdingScore} />
        </MapLibreGL.MarkerView>
      ))}
    </MapLibreGL.MapView>
  );
};
```

### 6.3 UI Component Library

Build a custom design system (no generic UI kit) with these primitives:

| Component | Notes |
|---|---|
| `<RouteCard />` | Shows route code badge, crowding bar, ETA, fare |
| `<StopMarker />` | Color-coded dot: green/yellow/orange/red by crowding |
| `<FareBadge />` | Displays ₱ amount with discount label if applicable |
| `<CrowdingIndicator />` | Animated bar with icon (seat, standing, packed) |
| `<VoiceButton />` | Pulsing mic button, triggers Whisper STT |
| `<TransferBadge />` | Number of transfers with connecting route codes |
| `<OfflineBanner />` | Snackbar shown when operating offline |
| `<ETACountdown />` | Live countdown timer to next departure |

### 6.4 State Management

```
Zustand stores:
├── useLocationStore     — user GPS position, heading, accuracy
├── useRouteStore        — search results, active route, step index
├── useSettingsStore     — passenger type, language, offline toggle
├── useCrowdingStore     — real-time crowding scores (WebSocket-fed)
└── useOfflineStore      — cached GTFS data, downloaded tile regions
```

### 6.5 Design System

**Color Palette:**

```css
:root {
  /* SugboWay Brand */
  --color-primary:    #E6500A;  /* Cebu sunset orange — jeepney warmth */
  --color-secondary:  #1A3A5C;  /* Deep Cebu sea blue */
  --color-accent:     #F5C842;  /* Sinulog gold */
  
  /* Semantic */
  --color-crowding-low:    #22C55E;  /* Green — comfortable */
  --color-crowding-mid:    #EAB308;  /* Yellow — moderate */
  --color-crowding-high:   #F97316;  /* Orange — crowded */
  --color-crowding-full:   #EF4444;  /* Red — packed */
  
  /* Surface */
  --color-surface:    #FAFAF8;
  --color-surface-2:  #F0EDE8;
  --color-text:       #1C1917;
  --color-text-muted: #78716C;
}
```

**Typography:**
- Display/Headers: `Lexend` (optimized for readability on small screens)
- Body: `DM Sans` (clean, modern, multilingual support)
- Monospace/Route codes: `JetBrains Mono` (crisp route number badges)

---

## 7. Offline-First & Edge Capabilities

### 7.1 Offline Data Strategy

**What must work offline:**
- Route search between any two major stops
- Stop information (name, routes served, walking distance)
- Fare calculation
- Turn-by-turn directions (cached route)
- Map rendering (pre-downloaded tiles)

**What requires connectivity:**
- Real-time crowding scores
- AI voice assistant (unless Edge AI model downloaded)
- Live GTFS-RT vehicle positions
- Route updates / GTFS feed refresh

### 7.2 Local Database (SQLite via Expo SQLite)

```sql
-- Bundled with app at install time (compressed ~15–30 MB)
CREATE TABLE offline_stops    (same schema as server-side);
CREATE TABLE offline_routes   (...);
CREATE TABLE offline_shapes   (...);
CREATE TABLE offline_fares    (...);
CREATE TABLE cached_routes    (query_hash TEXT, result_json TEXT, cached_at INTEGER);
```

**Update Strategy:**
- Check for GTFS version on app open (lightweight HEAD request)
- Background delta sync when on WiFi
- User can manually trigger "Update transit data" in settings
- Never block app launch on sync

### 7.3 Background Location Tracking (Navigation Mode)

```typescript
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

TaskManager.defineTask(LOCATION_TASK, ({ data, error }) => {
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const current = locations[0];
    // Check if user has reached next waypoint
    // Update step index in navigation store
    // Trigger haptic + TTS announcement if boarding/alighting point approaching
  }
});
```

---

## 8. DevOps, Infrastructure & CI/CD

### 8.1 Environments

| Env | Purpose | Deploy trigger |
|---|---|---|
| `development` | Local Docker Compose | Manual |
| `staging` | Fly.io / Railway | Push to `main` |
| `production` | Fly.io (API) + Vercel (Web) | Tag `v*.*.*` |

### 8.2 Docker Compose (Local Dev)

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: sugboway
      POSTGRES_PASSWORD: dev_password
    volumes:
      - ./db/init:/docker-entrypoint-initdb.d
    ports: ["5432:5432"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  routing-api:
    build: ./services/routing
    environment:
      DATABASE_URL: postgres://postgres:dev_password@postgres:5432/sugboway
      REDIS_URL: redis://redis:6379
    ports: ["8080:8080"]
    depends_on: [postgres, redis]

  ai-service:
    build: ./services/ai
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      DATABASE_URL: postgres://postgres:dev_password@postgres:5432/sugboway
    ports: ["8081:8081"]
    depends_on: [postgres]
```

### 8.3 CI Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
      - name: Run GTFS validation
        run: gtfs-validator --input gtfs/ --output gtfs-validation/
      - name: Run Go tests
        run: go test ./... -race -coverprofile=coverage.out
      - name: Run Python tests
        run: pytest services/ai/ --cov=. --cov-report=xml
      - name: Run React Native tests
        run: yarn test --coverage
      - name: Lint & type check
        run: yarn tsc && yarn eslint .

  build-mobile:
    needs: test
    steps:
      - name: Build EAS (Expo Application Services)
        run: eas build --platform all --profile preview
```

### 8.4 Monitoring

- **API performance:** Prometheus + Grafana (track P95 latency for route search — target <300ms)
- **Error tracking:** Sentry (both React Native and backend services)
- **Uptime:** Better Uptime or UptimeRobot with SMS alerts
- **Analytics:** PostHog (self-hosted) for feature usage — privacy-respecting

---

## 9. Testing & Quality Assurance

### 9.1 Test Strategy

| Layer | Tool | Coverage Target |
|---|---|---|
| GTFS data validation | `gtfs-validator` | 0 errors |
| Routing algorithm | Go unit tests | 95% |
| Fare calculation | Python pytest | 100% (deterministic) |
| API endpoints | Postman/Newman | All happy + error paths |
| RAG hallucination | Custom eval suite | <2% hallucination rate |
| React Native UI | Jest + RNTL | 80% component coverage |
| E2E mobile | Maestro | Critical user journeys |
| Offline mode | Manual + Maestro | All offline features |

### 9.2 Critical Test Cases

```python
# Routing tests
def test_carbon_to_sm_seaside():
    result = router.find_route("Carbon Market", "SM Seaside City")
    assert result.total_transfers <= 1
    assert result.total_fare_php >= 13.00
    assert len(result.legs) >= 1

def test_no_route_returns_graceful_error():
    result = router.find_route("Mactan Island", "Bantayan Island")
    assert result.error_code == "NO_ROUTE_FOUND"
    assert result.suggestion is not None  # suggests ferry or alternative

def test_pwd_discount_applied():
    fare = calculator.calculate(distance_km=6.0, passenger_type="pwd", transfers=0)
    assert fare.total_fare == pytest.approx(13.00 + (2.0 * 1.80)) * 0.80, rel=0.01
```

### 9.3 Anti-Hallucination Eval Suite

```python
# Test that AI never fabricates stop names
hallucination_test_cases = [
    {
        "query": "How do I get to Ayala Center Cebu from Carbon?",
        "must_contain_real_stops": True,
        "must_not_invent": ["Colon Station", "Carbon Terminus Hub"]  # fictional names
    },
    {
        "query": "Is there a direct route from IT Park to Talamban?",
        "expected_answer_type": "route_or_transfer",
        "hallucination_check": lambda resp: all(
            stop in VALID_STOPS for stop in extract_stop_names(resp)
        )
    }
]
```

---

## 10. Accessibility, Localization & Compliance

### 10.1 Accessibility (WCAG 2.1 AA + Mobile)

- All interactive elements have `accessibilityLabel` and `accessibilityHint`
- Minimum touch target: 44×44 pt (Apple HIG) / 48×48 dp (Material)
- Color contrast ratio: ≥4.5:1 for normal text, ≥3:1 for large text
- Screen reader support: VoiceOver (iOS) and TalkBack (Android)
- Wheelchair-accessible route filter: only shows stops with `wheelchair_boarding = 1`
- High-contrast mode: system preference respected via `useColorScheme`

### 10.2 Localization (i18n)

```typescript
// i18n/en.json
{
  "search.placeholder": "Where do you want to go?",
  "route.transfers": "{{count}} transfer",
  "route.transfers_plural": "{{count}} transfers",
  "crowding.comfortable": "Comfortable",
  "crowding.packed": "Very crowded — consider next jeep"
}

// i18n/ceb.json (Cebuano)
{
  "search.placeholder": "Asa ka gusto moadto?",
  "route.transfers": "{{count}} nga pagbalhin",
  "crowding.comfortable": "Komportable",
  "crowding.packed": "Puno kaayo — sulayi ang sunod jeep"
}

// i18n/fil.json (Filipino)
{
  "search.placeholder": "Saan ka pupunta?",
  "crowding.packed": "Sobrang siksik — subukan ang susunod na jeep"
}
```

### 10.3 Data Privacy & Compliance

- **Location data:** Never stored server-side without explicit opt-in; processed on-device for routing
- **Analytics:** Anonymized and aggregated; no PII in event payloads
- **GTFS data:** Public domain (government transit data); no licensing issues
- **Privacy policy:** Required before accessing location — plain language, in Filipino/Cebuano/English
- **DICT compliance:** Align with Philippines' Data Privacy Act of 2012 (RA 10173)

---

## 11. Data Contracts & API Specifications

### 11.1 Core API Endpoints

```
POST /api/v1/route/search
Body: { origin: Coordinate, destination: Coordinate, preferences: RoutePrefs }
Returns: RouteSearchResult[]

GET  /api/v1/stops/nearby?lat=&lon=&radius=500
Returns: Stop[]

GET  /api/v1/stops/:stopId/crowding
Returns: { score: float, label: string, updatedAt: ISO8601 }

POST /api/v1/ai/query
Body: { query: string, lang: "en"|"ceb"|"fil", context: UserContext }
Returns: { answer: string, routes: RouteResult[], confidence: float }

GET  /api/v1/gtfs/version
Returns: { version: string, publishedAt: ISO8601, changesUrl: string }

WS   /ws/crowding/:routeId
Emits: CrowdingUpdate every 30s
```

### 11.2 TypeScript Type Definitions (Shared)

```typescript
interface Coordinate { lat: number; lon: number; }

interface Stop {
  id: string;
  name: string;
  aliases: string[];
  location: Coordinate;
  routes: string[];
  crowdingScore?: number;  // 0.0–1.0
  wheelchairAccessible: boolean;
  hasShelter: boolean;
}

interface RouteResult {
  legs: RouteLeg[];
  totalTimeSeconds: number;
  totalFarePHP: number;
  transfers: number;
  crowdingWorstLeg: number;
  geoJson: GeoJSON.FeatureCollection;
}

interface RouteLeg {
  type: "transit" | "walking";
  routeId?: string;
  routeShortName?: string;
  fromStop: Stop;
  toStop: Stop;
  durationSeconds: number;
  distanceMeters: number;
  farePHP?: number;
  instructions: string[];
}
```

---

## 12. Security & Privacy

### 12.1 API Security

- All endpoints behind API Gateway with rate limiting (100 req/min per IP for anonymous, 1000 for authenticated)
- JWT authentication via Supabase; refresh tokens rotated every 7 days
- Input sanitization: all text queries sanitized against SQL injection (parameterized queries only)
- CORS: whitelist only `sugboway.app` and `localhost:3000`
- Secrets: never hardcoded; loaded from environment variables via Doppler or AWS Secrets Manager

### 12.2 Mobile Security

- API keys not shipped in app bundle; all sensitive calls proxied through backend
- Certificate pinning for production API calls
- Biometric auth gate for saved payment methods (if Beep integration added)
- Obfuscate with `react-native-obfuscating-transformer` for release builds

---

## Appendix: Development Milestones

| Phase | Deliverable | Est. Duration |
|---|---|---|
| **0 — Foundation** | Repo setup, Docker, CI pipeline, DB schema | 1 week |
| **1 — Data** | GTFS compilation, OSM integration, PostGIS import | 3 weeks |
| **2 — Routing** | Graph engine, Dijkstra + fares, REST API | 3 weeks |
| **3 — AI** | RAG pipeline, tool-use, multilingual NLP | 2 weeks |
| **4 — Mobile MVP** | Map, search, route results, navigation | 4 weeks |
| **5 — Analytics** | Crowding model, BPR integration, WebSocket | 2 weeks |
| **6 — Offline** | SQLite cache, tile download, offline routing | 2 weeks |
| **7 — Polish** | Design system, accessibility, i18n, animations | 2 weeks |
| **8 — Launch** | Beta testing, monitoring, app store submission | 2 weeks |
| **Total** | | ~21 weeks |

---

*SugboWay Skills Blueprint — v2.0 — Built for Cebu, for every commuter.*
