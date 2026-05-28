import os
import psycopg2
import math
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# Load env variables
load_dotenv(r'c:\Users\Lloyd\OneDrive\Desktop\SugboWay\sugboway-ai-service\.env')
db_url = os.getenv('DATABASE_URL')
gemini_key = os.getenv('GEMINI_API_KEY')

def run_seed():
    print("Reading seed SQL scripts...")
    with open('sugboway-routing-api/adapter/repository/seed_gtfs.sql', 'r', encoding='utf-8') as f:
        gtfs_sql = f.read()
    with open('sugboway-routing-api/adapter/repository/seed_lptrp.sql', 'r', encoding='utf-8') as f:
        lptrp_sql = f.read()

    try:
        print("Connecting to database...")
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        print("Executing GTFS SQL Seed...")
        cur.execute(gtfs_sql)
        conn.commit()
        print('GTFS SQL Seed Executed Successfully!')
        
        print("Executing LPTRP SQL Seed...")
        cur.execute(lptrp_sql)
        conn.commit()
        print('LPTRP SQL Seed Executed Successfully!')
        
        # Re-index stops table using text-embedding-004 (768-dimensions)
        print("Re-indexing stops table with Gemini 768-dim embeddings...")
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        cur.execute("ALTER TABLE stops DROP COLUMN IF EXISTS embedding;")
        cur.execute("ALTER TABLE stops ADD COLUMN embedding vector(768);")
        conn.commit()
        
        cur.execute("SELECT stop_id, stop_name, stop_desc FROM stops;")
        stops = cur.fetchall()
        
        if not stops:
            print("No stops found in the database to embed.")
            return
            
        print(f"Generating embeddings for {len(stops)} stops based on stop_name and stop_desc...")
        import time
        embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001", google_api_key=gemini_key, output_dimensionality=768)
        
        for stop_id, stop_name, stop_desc in stops:
            desc = stop_desc if stop_desc else ""
            text_to_embed = f"{stop_name} - {desc}".strip()
            
            # Robust retry-loop for Google API embedding generation
            embedding = None
            max_retries = 5
            base_delay = 2.0
            for attempt in range(max_retries):
                try:
                    embedding = embeddings.embed_query(text_to_embed)
                    break
                except Exception as ex:
                    print(f"Embedding failed for '{text_to_embed}' (attempt {attempt + 1}/{max_retries}): {ex}")
                    if attempt == max_retries - 1:
                        raise ex
                    time.sleep(base_delay * (2 ** attempt))
            
            cur.execute(
                "UPDATE stops SET embedding = %s WHERE stop_id = %s",
                (embedding, stop_id)
            )
            print(f"Embedded: {text_to_embed}")
            
        conn.commit()
        print("Successfully re-indexed stops!")
        cur.close()
        conn.close()
        
    except Exception as e:
        print('Error:', e)

if __name__ == "__main__":
    run_seed()
