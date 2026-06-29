from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import time
from collections import defaultdict
from dotenv import load_dotenv
import auth_quota

# Load environment variables
load_dotenv()

# Map GEMINI_API_KEY to GOOGLE_API_KEY for langchain-google-genai
if "GEMINI_API_KEY" in os.environ and "GOOGLE_API_KEY" not in os.environ:
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]

app = FastAPI(
    title="SugboWay AI Service",
    description="Conversational layer and RAG pipeline for SugboWay.",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory sliding window rate limit store
# IP -> list of timestamps
_rate_limit_store = defaultdict(list)

def check_rate_limit(key: str, limit) -> tuple[bool, int, int]:
    """Sliding-window limiter. `limit` None means unlimited.
    Returns (is_limited, remaining, reset_seconds)."""
    if limit is None:
        return False, 999999, 0
    now = time.time()
    one_hour_ago = now - 3600
    timestamps = [t for t in _rate_limit_store[key] if t > one_hour_ago]
    _rate_limit_store[key] = timestamps
    if len(timestamps) >= limit:
        oldest = timestamps[0]
        return True, 0, max(1, int(oldest + 3600 - now))
    timestamps.append(now)
    _rate_limit_store[key] = timestamps
    return False, limit - len(timestamps), 0

class ChatRequest(BaseModel):
    message: str
    user_id: str | None = None
    preferences: dict | None = None

class ChatResponse(BaseModel):
    reply: str
    remaining: int | None = 5

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "sugboway-ai-service"}

@app.post("/api/v1/chat")
async def chat_endpoint(request: ChatRequest, raw_request: Request):
    client_ip = raw_request.client.host if raw_request.client else "127.0.0.1"

    # Identify the caller: a valid Bearer token => per-user tier limit;
    # otherwise => guest (5/hour per IP). A present-but-invalid token => 401.
    tier = "guest"
    rate_key = f"ip:{client_ip}"
    limit = auth_quota.GUEST_LIMIT
    authz = raw_request.headers.get("Authorization", "")
    if authz.startswith("Bearer "):
        try:
            claims = auth_quota.verify_token(authz[len("Bearer "):])
            tier = claims["tier"]
            rate_key = f"user:{claims['user_id']}"
            limit = auth_quota.tier_limit(tier)
        except Exception:
            return JSONResponse(status_code=401, content={"error": "invalid_token"})

    is_limited, remaining, reset_seconds = check_rate_limit(rate_key, limit)
    if is_limited:
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limited",
                "message": "You've reached your hourly question limit.",
                "remaining": 0,
                "reset_seconds": reset_seconds,
                "tier": tier,
            },
        )
        
    try:
        from fastapi.concurrency import run_in_threadpool
        from agent.orchestrator import process_message
        reply = await run_in_threadpool(process_message, request.message)
        response = JSONResponse(content={"reply": reply, "remaining": remaining, "tier": tier})
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = "3600"
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
