# SugboWay Transit System — Phase 4 Implementation Plan (GTFS Data Ingestion)

This plan outlines the steps for populating your Render PostgreSQL (PostGIS) database with Cebu transit data. Without this data, both the Go routing engine and the Python AI Orchestrator cannot generate factual routes.

---

## User Review Required

> [!IMPORTANT]
> **Data Source**: We currently do not have a raw `.zip` GTFS feed on disk. I propose creating a SQL seed script (`seed_gtfs.sql`) that inserts realistic coordinates and stops for iconic Cebu routes (e.g., `13C` Talamban to Colon, and `MyBus` SM Seaside to IT Park). Are you okay with starting with seeded demo data, or do you have a specific GTFS CSV package you want to upload?

> [!WARNING]
> **Database Modification**: The seed script will execute `INSERT` statements against your live Render PostgreSQL instance. It will use `ON CONFLICT DO NOTHING` to prevent duplication if run multiple times.

---

## Open Questions

> [!NOTE]
> 1. **Data Quantity**: Should we start by mapping out just 2-3 main routes (like 13C and MyBus) to verify the AI and Routing algorithms, or do you want a wider net?
> 2. **AI Embeddings (pgvector)**: Once the stops are seeded, we need to generate their 1536-dimension embeddings using OpenAI so the RAG pipeline can find them. Do you want me to write a quick Python script that automatically generates these embeddings and saves them to the DB using your OpenAI key?

---

## Proposed Changes

### 1. Data Ingestion Seeding

#### [NEW] [sugboway-routing-api/adapter/repository/seed_gtfs.sql](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-routing-api/adapter/repository/seed_gtfs.sql)
A SQL script containing `INSERT` statements to populate the following tables with representative Cebu transit data:
- **`agency`**: Cebu City Transit, SM MyBus.
- **`stops`**: E.g., `stop_ayala` (Ayala Center Cebu), `stop_it_park` (Cebu IT Park), `stop_seaside` (SM Seaside). Includes WGS84 `stop_lat` and `stop_lon` for the automatic `location` geography generation via triggers.
- **`routes`**: Jeepney route `13C`, `17B`, and a `MyBus` route.
- **`trips` & `stop_times`**: The sequential stop graphs tying the nodes together.
- **`route_shapes`**: The `GEOGRAPHY(LineString, 4326)` representing the path on a map.

### 2. Embeddings Generator

#### [NEW] [sugboway-ai-service/scripts/embed_stops.py](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-ai-service/scripts/embed_stops.py)
A Python utility script that:
1. Connects to your Render database and fetches all `stops`.
2. Calls the OpenAI `text-embedding-3-small` (or ADA) model to compute embeddings based on the `stop_name` and `stop_desc`.
3. Updates the `embedding` column in the `stops` table so the LangChain RAG pipeline can instantly perform semantic proximity searches.

---

## Verification Plan

### Automated Tests
- N/A for data seeding, but we will run the `sugboway-routing-api` and hit the `/api/v1/stops/nearby?lat=10.3157&lon=123.8854&radius=1000` endpoint. If data is successfully seeded, it should return our seeded stops.

### Manual Verification
- We will connect to your Render database and count the rows in `stops`, `routes`, and `stop_times` to ensure they are populated.
- We will run the AI orchestrator to ask "How do I get to IT Park?" and verify the Contextual Fence allows the response (since IT Park will now exist in the verified database).
