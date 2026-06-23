#!/usr/bin/env python3
"""
apply_migration.py — run a single .sql file against DATABASE_URL.

Same connection style as seed_runner.py (psycopg2 + the AI service .env), so it
works without a local psql install. Use it to apply route-shape migrations to
your Render Postgres.

Usage:
    python apply_migration.py sugboway-routing-api/adapter/repository/migrations/0003_weebly_real_shapes.sql

DATABASE_URL resolution order:
    1. --db "<url>"           (explicit; use Render's EXTERNAL connection string)
    2. $DATABASE_URL          (environment)
    3. sugboway-ai-service/.env  (DATABASE_URL=...)
"""

import argparse
import os
import sys

import psycopg2
from dotenv import load_dotenv


def resolve_db_url(explicit: str | None) -> str | None:
    if explicit:
        return explicit
    if os.getenv("DATABASE_URL"):
        return os.getenv("DATABASE_URL")
    load_dotenv("sugboway-ai-service/.env")
    return os.getenv("DATABASE_URL")


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply a .sql migration to DATABASE_URL")
    ap.add_argument("sql_file", help="Path to the .sql file to execute")
    ap.add_argument("--db", help="Database URL (Render EXTERNAL connection string)")
    args = ap.parse_args()

    db_url = resolve_db_url(args.db)
    if not db_url:
        print("error: no DATABASE_URL (pass --db, set the env var, or add it to "
              "sugboway-ai-service/.env)", file=sys.stderr)
        return 2

    # Render Postgres requires SSL from outside its network.
    if "sslmode=" not in db_url and "render.com" in db_url:
        db_url += ("&" if "?" in db_url else "?") + "sslmode=require"

    with open(args.sql_file, "r", encoding="utf-8") as f:
        sql = f.read()

    safe_host = db_url.split("@")[-1].split("/")[0]
    print(f"Applying {args.sql_file} to {safe_host} ...")
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute(sql)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        return 1

    print("Done. The Go API serves geometry live — just reload the web app "
          "(no redeploy needed).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
