import os
import psycopg2
from psycopg2 import pool
import math
import requests
import json
import functools
from datetime import datetime

try:
    from langchain_classic.tools import tool
except ImportError:
    from langchain.tools import tool

from langchain_google_genai import GoogleGenerativeAIEmbeddings

ROUTING_API_BASE_URL = os.getenv("ROUTING_API_URL", "http://localhost:8080/api/v1")

# =====================================================================
# 1. Singletons and Connection Pooling for Cost and Resource Hardening
# =====================================================================

_embeddings_singleton = None
_db_pool = None
try:
    import redis
    # Use 127.0.0.1 or localhost. Default Render Redis URLs can be parsed.
    redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True, socket_connect_timeout=2)
except Exception as e:
    redis_client = None

def get_embeddings_client():
    global _embeddings_singleton
    if _embeddings_singleton is None:
        _embeddings_singleton = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001", 
            google_api_key=os.getenv("GEMINI_API_KEY"), 
            output_dimensionality=768
        )
    return _embeddings_singleton

@functools.lru_cache(maxsize=256)
def get_cached_embedding(text: str) -> list:
    """Computes and caches embeddings to drastically minimize Google API quota exhaustion."""
    key = text.strip().lower()
    client = get_embeddings_client()
    return client.embed_query(key)

def get_db_connection():
    global _db_pool
    if _db_pool is None:
        db_url = os.getenv("DATABASE_URL")
        # Simple psycopg2 connection pool (min=2, max=15)
        _db_pool = psycopg2.pool.SimpleConnectionPool(2, 15, db_url)
    return _db_pool.getconn()

def release_db_connection(conn):
    global _db_pool
    if _db_pool and conn:
        _db_pool.putconn(conn)

# =====================================================================
# 2. Optimized Spot Resolution & Stop Mappings
# =====================================================================

COMMON_STOPS_MAP = {
    "talamban": ("stop_talamban", "Talamban Gym", 10.3662, 123.9169),
    "talamban gym": ("stop_talamban", "Talamban Gym", 10.3662, 123.9169),
    "uc banilad": ("stop_uc_banilad", "UC Banilad", 10.3429, 123.9118),
    "banilad": ("stop_uc_banilad", "UC Banilad", 10.3429, 123.9118),
    "it park": ("stop_it_park", "Cebu IT Park (Terminal)", 10.3292, 123.9067),
    "cebu it park": ("stop_it_park", "Cebu IT Park (Terminal)", 10.3292, 123.9067),
    "ayala": ("stop_ayala", "Ayala Center Cebu PUV Terminal", 10.3182, 123.9048),
    "ayala center": ("stop_ayala", "Ayala Center Cebu PUV Terminal", 10.3182, 123.9048),
    "ayala center cebu": ("stop_ayala", "Ayala Center Cebu PUV Terminal", 10.3182, 123.9048),
    "colon": ("stop_colon", "Colon Obelisk", 10.2974, 123.8997),
    "colon obelisk": ("stop_colon", "Colon Obelisk", 10.2974, 123.8997),
    "seaside": ("stop_seaside", "SM Seaside City Cebu", 10.2818, 123.8805),
    "sm seaside": ("stop_seaside", "SM Seaside City Cebu", 10.2818, 123.8805),
    "sm seaside city cebu": ("stop_seaside", "SM Seaside City Cebu", 10.2818, 123.8805),
    "lahug": ("stop_lahug", "Lahug (JY Square)", 10.3308, 123.8973),
    "jy square": ("stop_lahug", "Lahug (JY Square)", 10.3308, 123.8973),
    "sm city": ("stop_sm_city", "SM City Cebu PUV Terminal", 10.3117, 123.9183),
    "sm city cebu": ("stop_sm_city", "SM City Cebu PUV Terminal", 10.3117, 123.9183),
    "labangon": ("stop_labangon", "Labangon Barangay Hall", 10.2995, 123.8821),
    "pitos": ("stop_pitos", "Pit-os Barangay Hall", 10.3950, 123.9260),
    "pit-os": ("stop_pitos", "Pit-os Barangay Hall", 10.3950, 123.9260),
    "carbon": ("stop_carbon", "Carbon Market", 10.2902, 123.9016),
    "carbon market": ("stop_carbon", "Carbon Market", 10.2902, 123.9016),
}

def find_stop_by_name(stop_name: str, conn=None) -> tuple[str, str, float, float] | None:
    """
    Finds a stop using a highly optimized three-tier strategy:
    1. Direct match on COMMON_STOPS_MAP (0ms, 0 credits).
    2. Case-insensitive database partial match (1ms, 0 credits).
    3. Fallback to vector/semantic search (only if the first two fail).
    """
    clean_name = stop_name.lower().strip()
    
    # Tier 1: Common map check
    if clean_name in COMMON_STOPS_MAP:
        return COMMON_STOPS_MAP[clean_name]
        
    # Check if a partial substring matches
    for k, v in COMMON_STOPS_MAP.items():
        if k in clean_name or clean_name in k:
            return v
            
    # Tier 2: DB ILIKE text search
    allocated_conn = False
    if conn is None:
        try:
            conn = get_db_connection()
            allocated_conn = True
        except Exception:
            pass
            
    if conn:
        try:
            with conn.cursor() as cur:
                # First try direct match
                cur.execute(
                    "SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_name ILIKE %s LIMIT 1",
                    (stop_name,)
                )
                res = cur.fetchone()
                if res:
                    return res
                    
                # Try substring search
                cur.execute(
                    "SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_name ILIKE %s OR stop_desc ILIKE %s LIMIT 1",
                    (f"%{stop_name}%", f"%{stop_name}%")
                )
                res = cur.fetchone()
                if res:
                    return res
        except Exception:
            pass
        finally:
            if allocated_conn and conn:
                release_db_connection(conn)
                
    # Tier 3: Vector/semantic search fallback (only gets here for unknown/newly added locations)
    try:
        query_vector = get_cached_embedding(stop_name)
        vs_conn = conn
        allocated_vs_conn = False
        if vs_conn is None:
            vs_conn = get_db_connection()
            allocated_vs_conn = True
            
        try:
            vs = VectorStore(conn=vs_conn)
            results = vs.search_similar_locations(query_vector, limit=1)
            if results:
                stop_id, name, desc = results[0]
                # Fetch coords for this stop
                with vs_conn.cursor() as cur:
                    cur.execute("SELECT stop_lat, stop_lon FROM stops WHERE stop_id = %s", (stop_id,))
                    coords = cur.fetchone()
                    if coords:
                        return (stop_id, name, coords[0], coords[1])
        finally:
            if allocated_vs_conn and vs_conn:
                release_db_connection(vs_conn)
    except Exception as e:
        print(f"Error in semantic fallback: {e}")
        
    return None

# =====================================================================
# 3. Agent Tools
# =====================================================================

@tool
def get_route_options(origin: str, destination: str, prefs: str = "time") -> str:
    """
    Calls the Go/Fiber API to run the Dijkstra engine and return verified route codes (e.g., 13C, 62B, 12L).
    Always use this to check for routes before providing an answer.
    """
    conn = None
    try:
        conn = get_db_connection()
        
        orig_res = find_stop_by_name(origin, conn=conn)
        dest_res = find_stop_by_name(destination, conn=conn)
        
        if not orig_res or not dest_res:
            return "No verified routes found."
            
        orig_id, orig_name, orig_lat, orig_lon = orig_res
        dest_id, dest_name, dest_lat, dest_lon = dest_res
        
        # Query local Go Routing API on port 8080
        url = f"{ROUTING_API_BASE_URL}/route/search"
        params = {
            "origin_lat": str(orig_lat),
            "origin_lon": str(orig_lon),
            "dest_lat": str(dest_lat),
            "dest_lon": str(dest_lon),
            "passenger_type": "regular",
            "accessible": "false"
        }
        
        response = requests.get(url, params=params, timeout=5)
        if response.status_code == 200:
            return response.text
        else:
            return f"No verified routes found between {orig_name} and {dest_name}."
    except Exception as e:
        return f"No verified routes found due to error: {str(e)}"
    finally:
        if conn:
            release_db_connection(conn)

@tool
def calculate_fare(distance_km: float, discount_type: str = "none") -> str:
    """
    Uses the deterministic calculator for the ₱13.00 base fare + surcharge matrix based on distance.
    Valid discount_types: none, student, pwd, senior
    """
    base_fare = 13.00
    base_distance = 4.0
    surcharge_per_km = 2.50 # Average surcharge, customize if needed

    if distance_km <= base_distance:
        total_fare = base_fare
    else:
        extra_distance = distance_km - base_distance
        total_fare = base_fare + (extra_distance * surcharge_per_km)

    if discount_type.lower() in ["student", "pwd", "senior"]:
        total_fare = total_fare * 0.80 # 20% discount

    return f"₱{total_fare:.2f}"

@tool
def check_congestion(route_id: str, departure_time: str = None) -> str:
    """
    Retrieves real-time scores based on the Bureau of Public Roads (BPR) function and peak hour windows (7-9 AM, 5-8 PM).
    Use this to give an estimate of how crowded a route might be and the BPR travel time multiplier.
    If departure_time is None, it uses the current time. 
    """
    global redis_client
    
    if departure_time is None:
        dt = datetime.now()
    else:
        try:
            dt = datetime.fromisoformat(departure_time.replace("Z", "+00:00"))
        except:
            dt = datetime.now()

    # Determine peak hour
    hour = dt.hour
    is_peak = (7 <= hour < 9) or (17 <= hour < 20)

    # Cache key format: congestion:<route_id>:<hour>
    cache_key = f"congestion:{route_id}:{hour}"
    
    # 1. Try Redis cache first
    if redis_client:
        try:
            cached_data = redis_client.get(cache_key)
            if cached_data:
                res = json.loads(cached_data)
                return f"[Cached] CrowdingLevel: {res['crowding']}. BPR Time Multiplier: {res['multiplier']:.2f}x standard travel time. (Peak: {res['is_peak']})"
        except Exception as e:
            # Circuit breaker: disable Redis on failure
            redis_client = None

    # Query DB for passenger volume, road type, and road capacity using connection pool
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT daily_passenger_volume, road_type, road_capacity FROM routes WHERE route_id = %s", (route_id,))
        result = cur.fetchone()
        cur.close()
        
        if result:
            pv, road_type, road_capacity = result
        else:
            return "Data unavailable. NOTE: Providing a standard schedule estimate rather than a real-time traffic prediction."
            
    except Exception as e:
        return "Data unavailable. NOTE: Providing a standard schedule estimate rather than a real-time traffic prediction."
    finally:
        if conn:
            release_db_connection(conn)
        
    alpha = 0.15 if is_peak else 0.10
    beta = 4.0 if is_peak else 3.0
    
    # Calibrated road capacity from database
    capacity = float(road_capacity) if road_capacity and road_capacity > 0 else 5000.0
    
    flow_ratio = float(pv) / capacity
    
    # Crowding predictor mapping to LOW, MEDIUM, HIGH
    if flow_ratio > 1.0 and is_peak:
        crowding = "HIGH (packed)"
    elif flow_ratio > 0.6:
        crowding = "MEDIUM (standing)"
    else:
        crowding = "LOW (seated)"
        
    congestion_factor = alpha * math.pow(flow_ratio, beta)
    time_multiplier = 1.0 + congestion_factor
    
    # 2. Push to Redis with 5-minute (300s) TTL
    if redis_client:
        try:
            res_dict = {
                "crowding": crowding,
                "multiplier": time_multiplier,
                "is_peak": is_peak
            }
            redis_client.setex(cache_key, 300, json.dumps(res_dict))
        except Exception as e:
            redis_client = None
            
    return f"CrowdingLevel: {crowding}. BPR Time Multiplier: {time_multiplier:.2f}x standard travel time. (Peak: {is_peak})"

from db.vectorstore import VectorStore

@tool
def verify_stop(stop_name: str) -> str:
    """
    Queries the database of verified transit stops in Cebu.
    Returns matching verified stops.
    Always use this tool to verify locations mentioned by the user and to look up correct stop names.
    """
    conn = None
    try:
        conn = get_db_connection()
        
        # 1. Try fast-path stop match
        matched = find_stop_by_name(stop_name, conn=conn)
        if matched:
            stop_id, name, lat, lon = matched
            # Get description
            with conn.cursor() as cur:
                cur.execute("SELECT stop_desc FROM stops WHERE stop_id = %s", (stop_id,))
                desc_row = cur.fetchone()
                desc = desc_row[0] if desc_row else ""
            return f"Nearest matching verified stops:\n- ID: '{stop_id}', Name: '{name}', Description: '{desc if desc else 'N/A'}'"
            
        # 2. Fallback to vector search if fast-path fails
        query_vector = get_cached_embedding(stop_name)
        vs = VectorStore(conn=conn)
        results = vs.search_similar_locations(query_vector, limit=3)
        if not results:
            return "No matching verified stops found in our GTFS database."
            
        stops_str = []
        for stop_id, name, desc in results:
            stops_str.append(f"- ID: '{stop_id}', Name: '{name}', Description: '{desc if desc else 'N/A'}'")
            
        return "Nearest matching verified stops:\n" + "\n".join(stops_str)
    except Exception as e:
        return f"Error verifying stop: {str(e)}"
    finally:
        if conn:
            release_db_connection(conn)
