package google

import (
	"context"
	"fmt"

	"sugboway-routing-api/domain"

	"google.golang.org/api/idtoken"
)

// IDTokenVerifier validates Google ID tokens against Google's public keys, with
// the audience pinned to our OAuth client ID.
type IDTokenVerifier struct {
	clientID string
}

// NewIDTokenVerifier builds a verifier for the given OAuth client ID.
func NewIDTokenVerifier(clientID string) *IDTokenVerifier {
	return &IDTokenVerifier{clientID: clientID}
}

// Verify validates the token (signature, audience, expiry, issuer) and returns
// the identity.
func (v *IDTokenVerifier) Verify(ctx context.Context, credential string) (*domain.GoogleIdentity, error) {
	payload, err := idtoken.Validate(ctx, credential, v.clientID)
	if err != nil {
		return nil, fmt.Errorf("google idtoken validate: %w", err)
	}
	if payload.Issuer != "accounts.google.com" && payload.Issuer != "https://accounts.google.com" {
		return nil, fmt.Errorf("unexpected google issuer: %s", payload.Issuer)
	}
	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)
	emailVerified, _ := payload.Claims["email_verified"].(bool)
	return &domain.GoogleIdentity{
		Sub:           payload.Subject,
		Email:         email,
		Name:          name,
		EmailVerified: emailVerified,
	}, nil
}
