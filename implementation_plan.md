# SugboWay AI Orchestration (FastAPI/LangChain) — Phase 3 Implementation Plan

This plan documents the architecture, RAG pipeline, and system prompt setup for the SugboWay AI conversational layer. It bridges the frontend with the verified Phase 2 routing engine.

---

## User Review Required

> [!IMPORTANT]
> **Dependencies**: This phase requires a Python 3.10+ environment with `fastapi`, `langchain`, `uvicorn`, `psycopg2`, and `pgvector` dependencies.
> **Contextual Fence Enforcement**: The prompt strictly prevents hallucinations. Are you okay with the AI refusing to answer questions about routes that aren't available in the GTFS database?

---

## Open Questions

> [!NOTE]
> **Lexicon Handling & FastText**: FastText models can be heavy. Would you prefer a lightweight heuristic/regex-based detection for Cebuano keywords initially, or should we immediately integrate the FastText model?
> **Offline Intents**: Running ONNX models (DistilBERT) typically requires specific runtimes (like `onnxruntime`). Shall we place this in a separate module to ensure the core FastAPI service remains lightweight?

---

## Proposed Changes

We will introduce a new project directory `sugboway-ai-service/` at the workspace root to contain the Python FastAPI service.

### 1. Project Scaffolding & FastAPI Setup

#### [NEW] [sugboway-ai-service/main.py](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-ai-service/main.py)
Entry point for the FastAPI server:
- Bootstraps the application and registers routes (`/api/v1/chat`).
- Sets up middleware (CORS, error handling).

#### [NEW] [sugboway-ai-service/requirements.txt](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-ai-service/requirements.txt)
Python dependencies: `fastapi`, `uvicorn`, `langchain`, `psycopg2-binary`, `pgvector`, `requests`.

### 2. LangChain Agent & Contextual Fence

#### [NEW] [sugboway-ai-service/agent/prompt.py](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-ai-service/agent/prompt.py)
Defines the `SYSTEM_PROMPT` containing the 'Contextual Fence'.
- Explicit instruction: "I cannot find a verified public transit route for that location yet" if the destination is missing.
- Etiquette rules: Instructs the AI to include "Wave your palm down" and "Lugar lang".

#### [NEW] [sugboway-ai-service/agent/orchestrator.py](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-ai-service/agent/orchestrator.py)
LangChain agent orchestration:
- Initializes the LLM and binds the tools.
- Sets up the RAG pipeline to pull relevant stops/vectors from the `pgvector` database before routing to the API.

### 3. Tool Definitions

#### [NEW] [sugboway-ai-service/agent/tools.py](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-ai-service/agent/tools.py)
Structured toolset for the LLM:
- `get_route_options(origin, destination, prefs)`: HTTP client that calls the Go Phase 2 routing API.
- `calculate_fare(distance, discount_type)`: Implements the deterministic ₱13.00 base fare logic (can fallback to Go API).
- `check_congestion(route_id)`: Fetches BPR congestion metrics based on time-of-day.

### 4. NLP & Localization Handlers

#### [NEW] [sugboway-ai-service/nlp/language.py](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-ai-service/nlp/language.py)
- Language detection module mapping Cebuano/Tagalog/English intents.
- Lexicon handler for terms like `plete`, `sakay`, and `lugsong`.

#### [NEW] [sugboway-ai-service/nlp/offline_intent.py](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-ai-service/nlp/offline_intent.py)
- Hooks and wrappers for loading a lightweight DistilBERT ONNX model for offline parsing when deployed locally or at edge.

### 5. Vector Database Integration

#### [NEW] [sugboway-ai-service/db/vectorstore.py](file:///c:/Users/Lloyd/OneDrive/Desktop/SugboWay/sugboway-ai-service/db/vectorstore.py)
- Connects to PostgreSQL.
- Manages `pgvector` queries to quickly retrieve locations, landmarks, and route aliases based on embeddings.

---

## Verification Plan

### Automated Tests
- Create Python `pytest` tests mocking the Go routing backend to verify the AI tools are functioning and the contextual fence is respected.
- Verify Language Detection accurately classifies sample bisaya phrases.

### Manual Verification
- Start both the Go API and Python FastAPI API.
- Send a REST request to `/api/v1/chat` asking for a route that does NOT exist to ensure the AI correctly returns the prohibited guessing response.
- Send a valid request to confirm etiquette cues are attached.
