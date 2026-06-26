-- Users for SugboWay authentication. Applied automatically on boot by the
-- embedded migrator (see adapter/repository/migrate.go).
CREATE TABLE IF NOT EXISTS users (
    id                       BIGSERIAL PRIMARY KEY,
    email                    TEXT NOT NULL UNIQUE,         -- stored lowercased
    password_hash            TEXT NOT NULL,                -- bcrypt
    tier                     TEXT NOT NULL DEFAULT 'free', -- free | pro | max
    email_verified           BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token_hash  TEXT,                         -- sha256 hex of the emailed token
    verification_expires_at  TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token_hash ON users (verification_token_hash);
