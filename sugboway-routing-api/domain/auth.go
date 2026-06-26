package domain

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// HashPassword returns a bcrypt hash of the plaintext password.
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

// CheckPassword reports whether password matches the stored bcrypt hash.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// TierHourlyLimit returns the per-hour AI-chat question limit for a tier.
// nil means unlimited. Unknown tiers fall back to the free limit.
func TierHourlyLimit(tier string) *int {
	switch tier {
	case "pro":
		n := 100
		return &n
	case "max":
		return nil
	default: // "free" and anything unexpected
		n := 10
		return &n
	}
}

// GenerateVerificationToken returns a random token to email (raw) and the
// sha256 hex to store (hash). Only the hash is persisted.
func GenerateVerificationToken() (raw string, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	raw = hex.EncodeToString(b)
	return raw, HashVerificationToken(raw), nil
}

// HashVerificationToken returns the sha256 hex of a raw token, for lookup.
func HashVerificationToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// Claims is the JWT payload shared with the Python AI service.
type Claims struct {
	Email string `json:"email"`
	Tier  string `json:"tier"`
	jwt.RegisteredClaims
}

// IssueJWT signs an HS256 token carrying the user id, email, and tier.
func IssueJWT(secret string, userID int64, email, tier string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		Email: email,
		Tier:  tier,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(userID, 10),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

// ParseJWT verifies an HS256 token and returns its claims.
func ParseJWT(secret, tokenStr string) (*Claims, error) {
	claims := &Claims{}
	tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil || !tok.Valid {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	return claims, nil
}
