from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import time
from collections import defaultdict
from dotenv import load_dotenv

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

def check_ip_rate_limit(ip: str) -> tuple[bool, int, int]:
    """
    Implements a sliding window rate limiter: Max 5 requests per hour.
    Returns (is_limited, remaining_requests, reset_seconds).
    """
    now = time.time()
    one_hour_ago = now - 3600
    
    # Clean up old request timestamps
    timestamps = [t for t in _rate_limit_store[ip] if t > one_hour_ago]
    _rate_limit_store[ip] = timestamps
    
    limit = 5
    
    if len(timestamps) >= limit:
        oldest = timestamps[0]
        reset_seconds = int(oldest + 3600 - now)
        return True, 0, max(1, reset_seconds)
        
    timestamps.append(now)
    _rate_limit_store[ip] = timestamps
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
    
    # Apply IP-based freemium rate limiting
    is_limited, remaining, reset_seconds = check_ip_rate_limit(client_ip)
    if is_limited:
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limited",
                "message": "You have exceeded the free tier quota of 5 AI queries per hour.",
                "remaining": 0,
                "reset_seconds": reset_seconds
            }
        )
        
    try:
        from agent.orchestrator import process_message
        reply = process_message(request.message)
        return {"reply": reply, "remaining": remaining}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
