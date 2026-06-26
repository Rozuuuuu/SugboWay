package domain

import "golang.org/x/crypto/bcrypt"

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
