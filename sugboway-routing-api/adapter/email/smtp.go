package email

import (
	"context"
	"fmt"
	"net/smtp"
)

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

// SendVerification emails a verification link to the recipient.
func (s *SMTPSender) SendVerification(_ context.Context, to, verifyURL string) error {
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
	auth := smtp.PlainAuth("", s.User, s.Pass, s.Host)
	addr := s.Host + ":" + s.Port
	return smtp.SendMail(addr, auth, s.From, []string{to}, msg)
}
