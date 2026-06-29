package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"sugboway-routing-api/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresUserStore implements domain.UserStore over the shared pgx pool.
type PostgresUserStore struct {
	Pool *pgxpool.Pool
}

// NewPostgresUserStore builds a user store sharing an existing pool.
func NewPostgresUserStore(pool *pgxpool.Pool) *PostgresUserStore {
	return &PostgresUserStore{Pool: pool}
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func (s *PostgresUserStore) CreateUser(ctx context.Context, name, email, passwordHash, tokenHash string, expiresAt time.Time) (*domain.User, error) {
	email = normalizeEmail(email)
	const q = `
		INSERT INTO users (name, email, password_hash, verification_token_hash, verification_expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, email, password_hash, tier, email_verified`
	u := &domain.User{}
	err := s.Pool.QueryRow(ctx, q, name, email, passwordHash, tokenHash, expiresAt).
		Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Tier, &u.EmailVerified)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *PostgresUserStore) GetUserByEmail(ctx context.Context, email string) (*domain.User, error) {
	email = normalizeEmail(email)
	const q = `
		SELECT id, name, email, password_hash, tier, email_verified
		FROM users WHERE email = $1`
	u := &domain.User{}
	err := s.Pool.QueryRow(ctx, q, email).
		Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.Tier, &u.EmailVerified)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *PostgresUserStore) MarkVerifiedByTokenHash(ctx context.Context, tokenHash string) (bool, error) {
	const q = `
		UPDATE users
		SET email_verified = TRUE,
		    verification_token_hash = NULL,
		    verification_expires_at = NULL,
		    updated_at = now()
		WHERE verification_token_hash = $1
		  AND email_verified = FALSE
		  AND verification_expires_at > now()`
	tag, err := s.Pool.Exec(ctx, q, tokenHash)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *PostgresUserStore) SetVerificationToken(ctx context.Context, email, tokenHash string, expiresAt time.Time) (bool, error) {
	email = normalizeEmail(email)
	const q = `
		UPDATE users
		SET verification_token_hash = $2,
		    verification_expires_at = $3,
		    updated_at = now()
		WHERE email = $1 AND email_verified = FALSE`
	tag, err := s.Pool.Exec(ctx, q, email, tokenHash, expiresAt)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (s *PostgresUserStore) UpdateTier(ctx context.Context, userID int64, tier string) error {
	const q = `UPDATE users SET tier = $2, updated_at = now() WHERE id = $1`
	_, err := s.Pool.Exec(ctx, q, userID, tier)
	return err
}
