import os
import psycopg2
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv("DATABASE_URL")
embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001", google_api_key=os.getenv("GEMINI_API_KEY"))

def get_embedding(text: str) -> list[float]:
    return embeddings.embed_query(text)

def embed_all_stops():
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        # Reset the embedding column for Gemini's 768 dimensions
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        cur.execute("ALTER TABLE stops DROP COLUMN IF EXISTS embedding;")
        cur.execute("ALTER TABLE stops ADD COLUMN embedding vector(768);")
        conn.commit()
        
        # Get all stops
        cur.execute("SELECT stop_id, stop_name FROM stops;")
        stops = cur.fetchall()
        
        if not stops:
            print("No stops found in the database.")
            return

        print(f"Found {len(stops)} stops. Generating embeddings with Gemini...")
        
        for stop_id, stop_name in stops:
            # We embed the stop name for semantic search
            embedding = get_embedding(stop_name)
            
            # Update the database
            cur.execute(
                "UPDATE stops SET embedding = %s WHERE stop_id = %s",
                (embedding, stop_id)
            )
            print(f"Embedded: {stop_name}")
            
        conn.commit()
        cur.close()
        conn.close()
        print("Successfully embedded all stops with Gemini!")
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    embed_all_stops()
