import os
import time
import requests
import threading
from datetime import datetime, timedelta, timezone

# Thread-safe global variables for weather caching (15-minute TTL)
_weather_cache = {"status_str": "Weather details currently unavailable", "expire_time": 0.0}
_weather_lock = threading.Lock()

def get_cebu_time_status() -> str:
    """
    Computes Cebu local time (UTC+8) and returns a status string describing
    the transit conditions, peak hours, and safety modes for that time.
    """
    # Cebu is UTC+8
    tz_cebu = timezone(timedelta(hours=8))
    now_cebu = datetime.now(timezone.utc).astimezone(tz_cebu)
    hour = now_cebu.hour
    time_str = now_cebu.strftime("%I:%M %p")
    
    is_morning_peak = 7 <= hour < 9
    is_evening_peak = 17 <= hour < 20
    is_late_night = hour >= 21 or hour < 5
    
    if is_morning_peak:
        status = (
            f"It is currently {time_str} in Cebu (Morning Rush Peak Hour). "
            f"Expect heavy south-to-north bottlenecks, especially along the Bulacao-NRA corridor (11,782 daily passengers). "
            f"Jeepneys will be highly crowded with standing-room only."
        )
    elif is_evening_peak:
        status = (
            f"It is currently {time_str} in Cebu (Evening Rush Peak Hour). "
            f"Expect severe traffic delays on major corridors. Travel times on routes (like 13C and 17B) "
            f"might take 20-40% longer than standard schedules."
        )
    elif is_late_night:
        status = (
            f"It is currently {time_str} in Cebu (Late Night). "
            f"Public transit (especially traditional jeepneys) will be sparse. "
            f"Late-Night Safety Mode is active: travelers are advised to verify stops and stay in well-lit terminals."
        )
    else:
        status = (
            f"It is currently {time_str} in Cebu (Off-Peak Hour). "
            f"Traffic flow is normal, and routes should run close to schedule with standard crowding levels."
        )
        
    return status

def get_cebu_weather_status() -> str:
    """
    Fetches real-time weather status for Cebu City using configured API keys
    (WeatherAPI, MapTiler, or OpenWeatherMap) with a thread-safe 15-minute cache.
    """
    global _weather_cache
    now = time.time()
    
    # 1. Try to read from cache first
    with _weather_lock:
        if _weather_cache["expire_time"] > now:
            return _weather_cache["status_str"]
            
    # 2. Cache expired or empty, fetch new data (performing HTTP request outside the lock)
    status_str = "Weather details currently unavailable"
    fetched = False
    
    # Detect configured API keys in environment and filter out placeholder strings
    weatherapi_key = os.getenv("WEATHER_API_KEY")
    if weatherapi_key and weatherapi_key.strip() in ("", "undefined", "null"):
        weatherapi_key = None
        
    maptiler_key = os.getenv("MAPTILER_KEY") or os.getenv("NEXT_PUBLIC_MAPTILER_KEY")
    if maptiler_key and maptiler_key.strip() in ("", "undefined", "null"):
        maptiler_key = None
        
    openweathermap_key = os.getenv("OPENWEATHER_KEY") or os.getenv("OPENWEATHERMAP_KEY")
    if openweathermap_key and openweathermap_key.strip() in ("", "undefined", "null"):
        openweathermap_key = None
    
    # Cebu coordinates
    lat, lon = 10.3157, 123.8854
    
    try:
        if weatherapi_key:
            # WeatherAPI.com (User requested)
            url = f"http://api.weatherapi.com/v1/current.json?key={weatherapi_key}&q=Cebu"
            res = requests.get(url, timeout=3)
            if res.status_code == 200:
                data = res.json()
                temp = data["current"]["temp_c"]
                condition = data["current"]["condition"]["text"].lower()
                humidity = data["current"]["humidity"]
                status_str = f"Weather: {condition.capitalize()}, Temp: {temp}°C, Humidity: {humidity}%"
                fetched = True
                
        elif maptiler_key:
            # MapTiler Weather API
            url = f"https://api.maptiler.com/weather/current.json?key={maptiler_key}&lat={lat}&lon={lon}"
            res = requests.get(url, timeout=3)
            if res.status_code == 200:
                data = res.json()
                main = data.get("weather", [{}])[0].get("main", "Clear")
                desc = data.get("weather", [{}])[0].get("description", "clear sky")
                temp_k = data.get("main", {}).get("temp")
                temp_c = round(temp_k - 273.15) if temp_k else 30
                humidity = data.get("main", {}).get("humidity", 80)
                status_str = f"Weather: {desc.capitalize()} ({main}), Temp: {temp_c}°C, Humidity: {humidity}%"
                fetched = True
                
        elif openweathermap_key:
            # OpenWeatherMap API
            url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={openweathermap_key}&units=metric"
            res = requests.get(url, timeout=3)
            if res.status_code == 200:
                data = res.json()
                desc = data["weather"][0]["description"]
                temp = data["main"]["temp"]
                humidity = data["main"]["humidity"]
                status_str = f"Weather: {desc.capitalize()}, Temp: {temp}°C, Humidity: {humidity}%"
                fetched = True
                
    except Exception as e:
        # Fall back to logs or degrade gracefully
        status_str = "Weather: Offline or API error, using standard dry conditions"
        
    # Write back to cache (regardless of success, to prevent rapid retry storms on failure)
    with _weather_lock:
        _weather_cache["status_str"] = status_str
        # If successfully fetched, cache for 15 mins (900s). If failed, cache for 2 mins to retry soon.
        ttl = 900 if fetched else 120
        _weather_cache["expire_time"] = now + ttl
        
    return status_str
