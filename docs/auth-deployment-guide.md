# Authentication — Deployment Setup Guide

Two things must be configured **in the Render dashboard** (not in code) before
sign-up/login works in production. Nothing here requires a code change or a rebuild of
the web app — these are runtime environment variables that take effect when the service
restarts (Render restarts automatically when you save env vars).

- **Task A — `AUTH_JWT_SECRET`** on **both** backend services (Go + Python).
- **Task B — SMTP + two URLs** on the **Go routing API** service only.

Then run the **end-to-end test** at the bottom to confirm it all works.

> Where to find a service's public URL: Render dashboard → click the service → the URL
> (e.g. `https://sugboway-routing-api.onrender.com`) is shown at the top of its page.
> Throughout this guide, replace the example URLs with your real ones.

---

## Before you start — what's already wired (and what auth reuses)

Your stack is already deployed: **three Render services** + **one Neon Postgres database**,
connected with environment variables.

- **Neon is connected by a connection string, not an API key.** That string is the
  `DATABASE_URL` env var, e.g.
  `postgresql://USER:PASS@ep-xxxx.REGION.aws.neon.tech/DB?sslmode=require`.
- The **same `DATABASE_URL` must be set on BOTH backends** — `sugboway-routing-api` (Go)
  and `sugboway-ai-service` (Python) — because they share the one database. (The web
  service does not use `DATABASE_URL`.)
- The other "keys" in your setup are `GEMINI_API_KEY` (on the AI service) and the
  `NEXT_PUBLIC_*` URLs (on the web service). None of those change for auth.

**Auth reuses that exact Neon database — no new database, no new connection.** When you
redeploy the Go routing API, it **auto-creates the `users` table on boot** (migrations
run automatically). So for authentication you only ADD the new env vars below; the
database wiring you already have stays untouched.

> ✅ Sanity check before you begin: confirm `DATABASE_URL` is present on **both** the
> routing API and the AI service (a common slip is setting it on only one).

**Deploy order:** add the new env vars (Tasks A & B) → let Render redeploy → the `users`
table appears on the Go service's boot → run the end-to-end test.

---

## Task A — Shared login secret (`AUTH_JWT_SECRET`)

**What it does:** The Go service uses this secret to *sign* a user's login token; the
Python AI service uses the *same* secret to *verify* it and apply the right chat quota.
If the two values don't match **exactly**, every logged-in chat request fails with `401`
and users silently drop back to the 5/hour guest limit.

### Step A1 — Generate one strong secret

Pick any one of these (run it once, copy the output):

```bash
# Git Bash / macOS / Linux:
openssl rand -base64 48

# Anywhere with Python:
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

You'll get something like `S7m2...long-random-string...9aQ`. This single value is used
in both services. Treat it like a password — don't commit it anywhere.

### Step A2 — Add it to the Go routing API service

1. Render dashboard → open **sugboway-routing-api**.
2. Left sidebar → **Environment**.
3. **Add Environment Variable**:
   - Key: `AUTH_JWT_SECRET`
   - Value: *(paste the secret from Step A1)*
4. **Save Changes** (Render redeploys the service automatically).

### Step A3 — Add the SAME value to the Python AI service

1. Render dashboard → open **sugboway-ai-service**.
2. **Environment** → **Add Environment Variable**:
   - Key: `AUTH_JWT_SECRET`
   - Value: *(paste the **exact same** secret — no extra spaces, no quotes)*
3. **Save Changes**.

> ⚠️ The #1 cause of "I logged in but chat still limits me to 5" is a mismatch here.
> Both services must hold the identical string. If unsure, re-paste the same value into
> both and let them redeploy.

---

## Task B — Verification email (SMTP) + links, on the Go service

All of these go on **sugboway-routing-api** only (it sends the email and builds the
links). This guide uses **Gmail** as the SMTP provider (you chose SMTP); any SMTP
provider works the same way — only the host/port/credentials differ.

### Step B1 — Create a Gmail App Password

A normal Gmail password won't work for SMTP; you need a 16-character **App Password**,
which requires 2-Step Verification to be on.

1. Go to **myaccount.google.com/security**.
2. Turn on **2-Step Verification** if it isn't already.
3. Go to **myaccount.google.com/apppasswords**.
4. App name: type `SugboWay` → **Create**.
5. Copy the **16-character password** it shows (e.g. `abcd efgh ijkl mnop`).
   **Remove the spaces** when you paste it later → `abcdefghijklmnop`.

### Step B2 — Add the SMTP + URL variables to the Go service

Render dashboard → **sugboway-routing-api** → **Environment** → add each of these:

| Key | Value (example — use your own) | Notes |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | Gmail's SMTP server |
| `SMTP_PORT` | `587` | STARTTLS port (the default) |
| `SMTP_USER` | `youraddress@gmail.com` | the Gmail account you made the App Password for |
| `SMTP_PASS` | `abcdefghijklmnop` | the 16-char App Password, **no spaces** |
| `SMTP_FROM` | `youraddress@gmail.com` | **see the warning below** |
| `APP_BASE_URL` | `https://sugboway-web.onrender.com` | your **web app** URL, **no trailing slash** |
| `PUBLIC_API_URL` | `https://sugboway-routing-api.onrender.com` | this **API's own** URL, **no trailing slash** |

Then **Save Changes**.

**What `APP_BASE_URL` and `PUBLIC_API_URL` are for:**
- `PUBLIC_API_URL` builds the link inside the email → `…/api/v1/auth/verify?token=…`.
  When the user clicks it, it hits *this* API, which marks them verified.
- `APP_BASE_URL` is where the API then redirects the browser → `…/?verified=1`, so the
  web app shows "Email verified — please sign in."

> ⚠️ **`SMTP_FROM` with Gmail:** Gmail rejects mail whose sender doesn't match the
> authenticated account. Set `SMTP_FROM` to the **same Gmail address** as `SMTP_USER`.
> You *can* use a display name — `SugboWay <youraddress@gmail.com>` — but if emails fail
> to send, fall back to the **plain address** `youraddress@gmail.com` (some servers
> reject the `Name <addr>` form as the envelope sender). Do **not** use
> `no-reply@sugboway.app` unless you actually own and have verified that domain with
> your provider.

> Using a provider other than Gmail (Brevo, Mailgun, Mailtrap, etc.)? Use their SMTP
> host/port/username/password instead, and set `SMTP_FROM` to an address that provider
> has authorized you to send from. Everything else is identical.

---

## Verify it works (end-to-end test)

Do this after both services have finished redeploying (Render shows "Live").

1. Open your web app (`https://sugboway-web.onrender.com`).
2. Go to the **Profile** tab → **Create account**.
3. Enter a **real email you can open** and a password (at least 8 characters) → submit.
4. You should see a **"Check your email"** screen.
5. Open your inbox (**check Spam** too) for the *Verify your SugboWay account* email,
   and click the link.
6. Your browser lands back on the app with a **"please sign in"** prompt.
7. **Sign in** with the same email/password. The Profile now shows your email, a
   **Free** plan badge, and **"10 of 10" questions left this hour**.
8. Open **Chat**, ask a question, and confirm it answers and the counter ticks down
   (Free = 10/hour, vs. 5/hour before you logged in).
9. *(Optional)* In Profile → **Plans**, click **Upgrade to Pro/Max** — the badge and the
   hourly limit change immediately (this upgrade is a demo; no payment is taken).

### Optional quick API check (no UI)

```bash
curl -X POST https://sugboway-routing-api.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"testpass123"}'
```
Expected: `{"status":"verify_email","email_sent":true}`.
If `email_sent` is `false`, the SMTP settings are wrong — see troubleshooting.

---

## Troubleshooting

| Symptom | Most likely cause | Fix |
|---|---|---|
| Register returns `email_sent: false` | Wrong SMTP host/port/user/pass, or Gmail blocked it | Re-check the 5 SMTP vars; confirm the App Password has no spaces; read the routing-API logs in Render |
| No email arrives (but `email_sent: true`) | In Spam, or `SMTP_FROM` ≠ `SMTP_USER` on Gmail | Check Spam; set `SMTP_FROM` to the same Gmail address (try the plain address with no display name) |
| Verify link 404s or redirects wrong | `PUBLIC_API_URL` / `APP_BASE_URL` wrong | Use the exact `https://…onrender.com` URLs, **no trailing slash**, `https` not `http` |
| Logged in, but chat still caps at 5 / returns 401 | `AUTH_JWT_SECRET` mismatch between the two services | Put the **identical** value in both; let both redeploy |
| Modal says "Can't reach the server" | Web app's `NEXT_PUBLIC_ROUTING_API_URL` not pointing at the deployed API | That var is **baked at build time** — fix it and **rebuild** the web service |
| "email_not_verified" on login | User hasn't clicked the link yet | Use **Resend** on the check-email screen, then click the new link |

---

## Quick checklist

- [ ] `DATABASE_URL` (the Neon connection string) is set on **both** backends.
- [ ] Generated one strong `AUTH_JWT_SECRET`.
- [ ] Same `AUTH_JWT_SECRET` on **both** sugboway-routing-api and sugboway-ai-service.
- [ ] Gmail 2-Step Verification on; App Password created.
- [ ] `SMTP_HOST/PORT/USER/PASS/FROM` set on sugboway-routing-api (`SMTP_FROM` = the Gmail address).
- [ ] `APP_BASE_URL` = web URL, `PUBLIC_API_URL` = routing-API URL (both `https`, no trailing slash).
- [ ] Both services redeployed and "Live".
- [ ] Ran the end-to-end test: register → email → verify → sign in → chat (10/hr).
