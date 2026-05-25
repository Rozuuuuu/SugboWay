import os
import psycopg2
from dotenv import load_dotenv

# load the env from parent dir
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
db_url = os.getenv('DATABASE_URL')
sql_file = os.path.join(os.path.dirname(__file__), '..', '..', 'sugboway-routing-api', 'adapter', 'repository', 'seed_gtfs.sql')

def run_seed():
    print("Reading seed SQL...")
    with open(sql_file, 'r', encoding='utf-8') as f:
        sql = f.read()

    print("Executing seed SQL against Render...")
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute(sql)
        conn.commit()
        print('SQL Seed Executed Successfully!')
    except Exception as e:
        print('Error executing SQL:', e)
    finally:
        if 'conn' in locals() and conn:
            cur.close()
            conn.close()

if __name__ == "__main__":
    run_seed()
