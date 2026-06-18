import os
import time
import threading
import re
from datetime import datetime, timedelta, timezone

try:
    from langchain_classic.agents import create_tool_calling_agent, AgentExecutor
except ImportError:
    from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_google_genai import ChatGoogleGenerativeAI
from .prompt import get_chat_prompt
from .tools import get_route_options, calculate_fare, check_congestion, verify_stop, redis_client
from .environmental import get_cebu_time_status, get_cebu_weather_status

# =====================================================================
# 1. Thread-Safe Local Response Cache (Fallback if Redis is offline)
# =====================================================================
class SimpleTTLCache:
    def __init__(self, maxsize=512, ttl_seconds=1800): # Default 30 minutes cache
        self.maxsize = maxsize
        self.ttl = ttl_seconds
        self.cache = {}
        self.lock = threading.Lock()

    def get(self, key: str) -> str:
        with self.lock:
            if key in self.cache:
                val, expire = self.cache[key]
                if expire > time.time():
                    return val
                else:
                    del self.cache[key]
            return None

    def set(self, key: str, value: str):
        with self.lock:
            # Clean up expired items if cache is getting large
            now = time.time()
            if len(self.cache) >= self.maxsize:
                keys_to_del = [k for k, (_, exp) in self.cache.items() if exp <= now]
                for k in keys_to_del:
                    del self.cache[k]
                
                # If still too large, eject oldest key
                if len(self.cache) >= self.maxsize:
                    oldest_key = next(iter(self.cache.keys()))
                    del self.cache[oldest_key]
                    
            self.cache[key] = (value, now + self.ttl)

_local_response_cache = SimpleTTLCache()
_agent_executor_singleton = None

def setup_agent():
    # Map GEMINI_API_KEY to GOOGLE_API_KEY for langchain-google-genai
    if "GEMINI_API_KEY" in os.environ and "GOOGLE_API_KEY" not in os.environ:
        os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]
        
    # Initialize the LLM with Gemini
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)

    # Define the tools available to the agent
    tools = [get_route_options, calculate_fare, check_congestion, verify_stop]

    # Get the system prompt template (which has placeholders for time_status and weather_status)
    prompt = get_chat_prompt()

    # Create the agent
    agent = create_tool_calling_agent(llm, tools, prompt)

    # Create the executor
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True, max_iterations=3)

    return agent_executor

def get_agent_executor():
    global _agent_executor_singleton
    if _agent_executor_singleton is None:
        _agent_executor_singleton = setup_agent()
    return _agent_executor_singleton

def _normalize_message(message: str) -> str:
    """Normalizes the input message for caching (lowercased, stripped, punctuation removed)."""
    clean = message.lower().strip()
    clean = re.sub(r'[^\w\s]', '', clean)
    return re.sub(r'\s+', ' ', clean)

def _get_context_categories() -> tuple[str, str]:
    """Determines simple cache category keys for time block and weather status."""
    tz_cebu = timezone(timedelta(hours=8))
    now_cebu = datetime.now(timezone.utc).astimezone(tz_cebu)
    hour = now_cebu.hour
    
    if 7 <= hour < 9:
        time_period = "morning_peak"
    elif 17 <= hour < 20:
        time_period = "evening_peak"
    elif hour >= 21 or hour < 5:
        time_period = "late_night"
    else:
        time_period = "off_peak"
        
    # Retrieve weather text to classify weather
    weather_text = get_cebu_weather_status().lower()
    if "rain" in weather_text or "drizzle" in weather_text or "storm" in weather_text:
        weather_cat = "rain"
    elif "cloud" in weather_text:
        weather_cat = "cloudy"
    else:
        weather_cat = "clear"
        
    return time_period, weather_cat

def process_message(message: str) -> str:
    """
    Main entry point for processing a user's chat message.
    Includes time/weather injection, and thread-safe caching.
    """
    global redis_client
    
    # 1. Gather dynamic real-time status contexts
    time_status = get_cebu_time_status()
    weather_status = get_cebu_weather_status()
    
    # 2. Cache check
    normalized = _normalize_message(message)
    time_period, weather_cat = _get_context_categories()
    cache_key = f"chat:{time_period}:{weather_cat}:{normalized}"
    
    # Try Redis cache first
    if redis_client:
        try:
            cached_reply = redis_client.get(cache_key)
            if cached_reply:
                print(f"[Cache Hit - Redis] {cache_key}")
                return cached_reply
        except Exception:
            # Circuit breaker: disable Redis on failure to prevent 2-second connection timeouts on future queries
            print("[Redis Cache] Connection failed. Disabling Redis integration.")
            redis_client = None
            
    # Try local memory cache
    cached_reply = _local_response_cache.get(cache_key)
    if cached_reply:
        print(f"[Cache Hit - Local] {cache_key}")
        return cached_reply

    # 3. Cache miss: Invoke Agent
    agent_executor = get_agent_executor()
    
    try:
        response = agent_executor.invoke({
            "input": message,
            "time_status": time_status,
            "weather_status": weather_status
        })
        output = response.get("output", "I encountered an error processing your request.")
        
        if isinstance(output, list):
            text_parts = []
            for block in output:
                if isinstance(block, dict) and "text" in block:
                    text_parts.append(block["text"])
                elif hasattr(block, "text"):
                    text_parts.append(getattr(block, "text"))
                else:
                    text_parts.append(str(block))
            output = "".join(text_parts)
        elif not isinstance(output, str):
            output = str(output)
            
        # 4. Save to caches (Redis and Local)
        if redis_client:
            try:
                # 30-minute expiration (1800 seconds)
                redis_client.setex(cache_key, 1800, output)
            except Exception:
                redis_client = None
        
        _local_response_cache.set(cache_key, output)
        return output
        
    except Exception as e:
        return f"Error: {str(e)}"
