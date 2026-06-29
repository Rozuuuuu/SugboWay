package email

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"time"
)

// dialTimeout bounds how long a send may wait on a slow/blocked SMTP server.
// Render (and many PaaS hosts) throttle or block outbound SMTP, so without this
// a send can hang for minutes.
const dialTimeout = 15 * time.Second

// SMTPSender sends verification email via a standard SMTP server.
type SMTPSender struct {
	Host string
	Port string
	User string
	Pass string
	From string
}

// NewSMTPSender constructs an SMTP-backed email sender.
func NewSMTPSender(host, port, user, pass, from string) *SMTPSender {
	return &SMTPSender{Host: host, Port: port, User: user, Pass: pass, From: from}
}

// SendVerification emails a verification link to the recipient. It dials with a
// timeout, upgrades to TLS via STARTTLS when offered, authenticates, and sends.
func (s *SMTPSender) SendVerification(_ context.Context, to, verifyURL string) error {
	if s.Host == "" {
		return fmt.Errorf("smtp not configured: SMTP_HOST is empty")
	}

	subject := "Verify your SugboWay account"
	body := fmt.Sprintf(
		"Maayong adlaw!\r\n\r\n"+
			"Confirm your SugboWay account by opening this link:\r\n%s\r\n\r\n"+
			"The link expires in 24 hours. If you didn't sign up, ignore this email.\r\n\r\n"+
			"— SugboWay, Cebu transit made simple",
		verifyURL,
	)
	msg := []byte(fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		s.From, to, subject, body,
	))

	// The envelope sender (MAIL FROM) must be a bare address; some MTAs reject
	// the "Name <addr>" display form. The header above keeps the friendly form.
	envelopeFrom := s.From
	if parsed, err := mail.ParseAddress(s.From); err == nil {
		envelopeFrom = parsed.Address
	}

	addr := net.JoinHostPort(s.Host, s.Port)
	conn, err := net.DialTimeout("tcp", addr, dialTimeout)
	if err != nil {
		return fmt.Errorf("smtp dial %s: %w", addr, err)
	}

	c, err := smtp.NewClient(conn, s.Host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("smtp new client: %w", err)
	}
	defer c.Close()

	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: s.Host}); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}
	if s.User != "" {
		if err := c.Auth(smtp.PlainAuth("", s.User, s.Pass, s.Host)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := c.Mail(envelopeFrom); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}
	if err := c.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt to: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp close: %w", err)
	}
	return c.Quit()
}
