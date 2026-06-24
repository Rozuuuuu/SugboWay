-- ======================================================================
-- 0005_routes_has_conductor.sql — ensure routes.has_conductor exists
-- ======================================================================
-- schema.sql historically lacked this column (it was only added by the
-- non-auto-run seed_lptrp.sql), so a fresh auto-migrated DB had no
-- has_conductor column and /routes/serving + /route/conductor failed with 500.
-- This patches any existing database; fresh ones already get it from schema.sql.

ALTER TABLE routes ADD COLUMN IF NOT EXISTS has_conductor BOOLEAN DEFAULT TRUE;

-- Modern e-jeeps and buses use tap-to-pay (no conductor).
UPDATE routes SET has_conductor = FALSE WHERE is_modernized = TRUE;
