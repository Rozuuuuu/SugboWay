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
        
    hour = dt.hour
    is_peak = (7 <= hour < 9) or (17 <= hour < 20)
    
    alpha = 0.15 if is_peak else 0.10
    beta = 4.0 if is_peak else 3.0
    capacity = 10000.0 if road_type == "national" else 5000.0
    
    flow_ratio = float(pv) / capacity
    
    # Crowding predictor
    if flow_ratio > 1.0 and is_peak:
        crowding = "HIGH (packed)"
    elif flow_ratio > 0.6:
        crowding = "MEDIUM (standing)"
    else:
        crowding = "LOW (seated)"
        
    congestion_factor = alpha * math.pow(flow_ratio, beta)
    time_multiplier = 1.0 + congestion_factor
    
    return f"CrowdingLevel: {crowding}. BPR Time Multiplier: {time_multiplier:.2f}x standard travel time. (Peak: {is_peak})"
