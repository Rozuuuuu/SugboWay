package repository

import (
	"context"
	"embed"
	"fmt"
	"log"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SQL is compiled into the binary, so migrations run identically locally and on
// Render with no dependency on the runtime working directory.
//
//go:embed schema.sql
//go:embed migrations/*.sql
var migrationFS embed.FS

// advisoryLockKey serializes migration runs across multiple instances.
const advisoryLockKey int64 = 990417

// RunMigrations ensures the base schema exists, then applies any pending files
// in migrations/ exactly once (tracked in schema_migrations). All migration
// files are idempotent, but the tracking table avoids redundant re-runs and
// lets future non-idempotent migrations be added safely.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	// Serialize concurrent boots (e.g. multiple Render instances) so two
	// processes don't apply the same migration at once.
	if _, err := pool.Exec(ctx, "SELECT pg_advisory_lock($1)", advisoryLockKey); err != nil {
		return fmt.Errorf("acquire advisory lock: %w", err)
	}
	defer pool.Exec(ctx, "SELECT pg_advisory_unlock($1)", advisoryLockKey)

	// 1. Base schema — idempotent (CREATE ... IF NOT EXISTS / CREATE OR REPLACE).
	schema, err := migrationFS.ReadFile("schema.sql")
	if err != nil {
		return fmt.Errorf("read schema.sql: %w", err)
	}
	if _, err := pool.Exec(ctx, string(schema)); err != nil {
		return fmt.Errorf("apply schema.sql: %w", err)
	}

	// 2. Migration bookkeeping table.
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	// 3. Collect and sort migration files (lexical order = apply order).
	entries, err := migrationFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)

	// 4. Apply each pending migration in its own transaction.
	applied := 0
	for _, name := range files {
		var exists bool
		if err := pool.QueryRow(ctx,
			"SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)", name,
		).Scan(&exists); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if exists {
			continue
		}

		body, err := migrationFS.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin tx for %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, string(body)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx,
			"INSERT INTO schema_migrations(version) VALUES($1)", name,
		); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("record migration %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}
		log.Printf("[migrate] applied %s", name)
		applied++
	}

	if applied == 0 {
		log.Println("[migrate] database already up to date")
	} else {
		log.Printf("[migrate] applied %d migration(s)", applied)
	}
	return nil
}
