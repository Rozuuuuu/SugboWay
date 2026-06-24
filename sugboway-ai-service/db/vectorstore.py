import psycopg2
from pgvector.psycopg2 import register_vector
import os

class VectorStore:
    def __init__(self, conn=None):
        """
        Connect to PostgreSQL and register pgvector extension.
        Accepts an optional active connection `conn` (e.g. from a connection pool).
        """
        self.conn = conn
        self.own_connection = False
        
        if self.conn is None:
            db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/sugboway")
            try:
                self.conn = psycopg2.connect(db_url)
                self.own_connection = True
                register_vector(self.conn)
            except Exception as e:
                print(f"Error connecting to pgvector DB: {e}")
        else:
            try:
                # Register vector type on injected connection if not already registered
                register_vector(self.conn)
            except Exception:
                pass

    def search_similar_locations(self, query_embedding: list, limit: int = 3):
        """
        Performs an exact nearest neighbor search over the `stops` table using L2 distance.
        """
        if self.conn is None:
            return []
            
        try:
            with self.conn.cursor() as cur:
                cur.execute("""
                    SELECT stop_id, stop_name, stop_desc 
                    FROM stops 
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <-> %s 
                    LIMIT %s
                """, (query_embedding, limit))
                results = cur.fetchall()
                return results
        finally:
            # If we opened our own connection, close it when we are done
            if self.own_connection and self.conn:
                try:
                    self.conn.close()
                except Exception:
                    pass
                self.conn = None
