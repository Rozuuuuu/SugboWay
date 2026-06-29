-- Add a display name to users (collected at sign-up). Applied automatically on
-- boot by the embedded migrator.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
