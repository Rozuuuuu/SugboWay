import psycopg2
from pgvector.psycopg2 import register_vector
import os

class VectorStore:
    def __init__(self):
        """
        Connect to PostgreSQL and register pgvector extension.
        Ensure DATABASE_URL is set in environment variables.
        """
        db_url = os.getenv("DATABASE_URL", "postgresql://sugboway_user:icblLufDCbcAuk0KWbQdaoxyI8uU2zmF@dpg-d89tckegvqtc73cakufg-a.oregon-postgres.render.com/sugboway")
        try:
            self.conn = psycopg2.connect(db_url)
            register_vector(self.conn)
            self._init_db()
        except Exception as e:
            print(f"Error connecting to pgvector DB: {e}")

    def _init_db(self):
        """
        Initializes the vector column in the stops table if not already present.
        (Assuming Phase 2 created the `stops` table)
        """
        with self.conn.cursor() as cur:
            # Add embedding column to stops if it doesn't exist.
            # Using 1536 dimensions as standard for OpenAI embeddings.
            cur.execute("""
                ALTER TABLE stops ADD COLUMN IF NOT EXISTS embedding vector(1536);
            """)
            self.conn.commit()

    def search_similar_locations(self, query_embedding: list, limit: int = 3):
        """
        Performs an exact nearest neighbor search over the `stops` table using L2 distance.
        """
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT stop_id, stop_name, stop_desc 
                FROM stops 
                ORDER BY embedding <-> %s 
                LIMIT %s
            """, (query_embedding, limit))
            results = cur.fetchall()
            return results
