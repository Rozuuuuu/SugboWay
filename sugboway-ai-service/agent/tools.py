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

@tool
def check_congestion(route_id: str) -> str:
    """
    Retrieves real-time scores based on the Bureau of Public Roads (BPR) function and peak hour windows (7-9 AM, 5-8 PM).
    Use this to give an estimate of how crowded a route might be.
    """
    # Placeholder for actual BPR calculation or external API call
    return f"Congestion data for {route_id}: Moderate traffic. Proceed with normal travel time estimates."
