import psycopg2
import os
from dotenv import load_dotenv

load_dotenv(r'c:\Users\Lloyd\OneDrive\Desktop\SugboWay\sugboway-ai-service\.env')

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE routes ADD COLUMN IF NOT EXISTS daily_passenger_volume INTEGER DEFAULT 5000;")
    cur.execute("ALTER TABLE routes ADD COLUMN IF NOT EXISTS road_type TEXT DEFAULT 'national';")
    
    # Update the seed values
    cur.execute("UPDATE routes SET daily_passenger_volume = 11763, road_type = 'national' WHERE route_id = 'route_13c';")
    cur.execute("UPDATE routes SET daily_passenger_volume = 8000, road_type = 'barangay' WHERE route_id = 'route_17b';")
    cur.execute("UPDATE routes SET daily_passenger_volume = 11782, road_type = 'national' WHERE route_id = 'route_mybus_1';")
    
    conn.commit()
    print("Migration successful")
except Exception as e:
    print(f"Error: {e}")
finally:
    cur.close()
    conn.close()
