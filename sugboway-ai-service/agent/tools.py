import requests
from langchain.tools import tool

ROUTING_API_BASE_URL = "http://localhost:3000/api/v1" # Placeholder for Go Phase 2 routing API

@tool
def get_route_options(origin: str, destination: str, prefs: str = "time") -> str:
    """
    Calls the Go/Fiber API to run the Dijkstra engine and return verified route codes (e.g., 13C, 62B, 12L).
    Always use this to check for routes before providing an answer.
    """
    # In a real scenario, this would query the local Go routing engine
    try:
        response = requests.get(f"{ROUTING_API_BASE_URL}/route/search", params={
            "origin": origin,
            "destination": destination,
            "prefs": prefs
        })
        if response.status_code == 200:
            return response.text
        return "No verified routes found."
    except Exception as e:
        return "No verified routes found."

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

import os
import psycopg2
import math
from datetime import datetime

try:
    import redis
    import json
    # Use 127.0.0.1 or localhost. Default Render Redis URLs can be parsed.
    redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True, socket_connect_timeout=2)
except Exception as e:
    redis_client = None

@tool
def check_congestion(route_id: str, departure_time: str = None) -> str:
    """
    Retrieves real-time scores based on the Bureau of Public Roads (BPR) function and peak hour windows (7-9 AM, 5-8 PM).
    Use this to give an estimate of how crowded a route might be and the BPR travel time multiplier.
    If departure_time is None, it uses the current time. 
    """
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
            pass # Fall back to PostgreSQL if Redis fails

    # Query DB for passenger volume and road type
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cur = conn.cursor()
        cur.execute("SELECT daily_passenger_volume, road_type FROM routes WHERE route_id = %s", (route_id,))
        result = cur.fetchone()
        cur.close()
        conn.close()
        
        if result:
            pv, road_type = result
        else:
            return "Data unavailable. NOTE: Providing a standard schedule estimate rather than a real-time traffic prediction."
            
    except Exception as e:
        return "Data unavailable. NOTE: Providing a standard schedule estimate rather than a real-time traffic prediction."
        
    alpha = 0.15 if is_peak else 0.10
    beta = 4.0 if is_peak else 3.0
    capacity = 10000.0 if road_type == "national" else 5000.0
    
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
            pass
            
    return f"CrowdingLevel: {crowding}. BPR Time Multiplier: {time_multiplier:.2f}x standard travel time. (Peak: {is_peak})"

from db.vectorstore import VectorStore
from langchain_google_genai import GoogleGenerativeAIEmbeddings

@tool
def verify_stop(stop_name: str) -> str:
    """
    Queries the database of verified transit stops in Cebu using semantic vector search (768-dim Gemini embeddings).
    Returns the nearest verified stop matches (including name and description).
    Always use this tool to verify locations mentioned by the user and to look up correct stop names.
    """
    try:
        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001", 
            google_api_key=os.getenv("GEMINI_API_KEY"), 
            output_dimensionality=768
        )
        query_vector = embeddings.embed_query(stop_name)
        
        vs = VectorStore()
        results = vs.search_similar_locations(query_vector, limit=3)
        if not results:
            return "No matching verified stops found in our GTFS database."
            
        stops_str = []
        for stop_id, name, desc in results:
            stops_str.append(f"- ID: '{stop_id}', Name: '{name}', Description: '{desc if desc else 'N/A'}'")
            
        return "Nearest matching verified stops:\n" + "\n".join(stops_str)
    except Exception as e:
        return f"Error verifying stop semantically: {str(e)}"

