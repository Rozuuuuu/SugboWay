import os
import psycopg2

db_url = "postgresql://sugboway_user:icblLufDCbcAuk0KWbQdaoxyI8uU2zmF@dpg-d89tckegvqtc73cakufg-a.oregon-postgres.render.com/sugboway"

def run_seed():
    sql_path = r"c:\Users\Lloyd\OneDrive\Desktop\SugboWay\sugboway-routing-api\adapter\repository\seed_lptrp.sql"
    print(f"Reading SQL script from {sql_path}...")
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()

    print("Connecting to PostgreSQL database...")
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor()

    print("Executing SQL statements...")
    cur.execute(sql)
    print("Database schema updated and LPTRP data successfully seeded!")

    cur.close()
    conn.close()

if __name__ == "__main__":
    run_seed()
