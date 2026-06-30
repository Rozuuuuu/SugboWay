# Brevo Email Setup — Full Walkthrough

SugboWay sends the account-verification email through **Brevo** over its HTTPS API
(this works on Render, which blocks plain SMTP). This guide takes you from zero to a
working verification email. It's all done in the **Brevo dashboard** + the **Render
dashboard** — no code changes.

**End goal:** three values set on the `sugboway-routing-api` service in Render —
`BREVO_API_KEY`, `EMAIL_FROM` (a *verified* sender), and your two URLs — after which
sign-up emails send automatically.

---

## Step 1 — Create a Brevo account

1. Go to **https://www.brevo.com** and click **Sign up free**.
2. Register with your email, confirm your own email address, and finish the short
   onboarding (company name can be anything, e.g. "SugboWay").
3. The **free plan** is enough: up to **300 emails/day**. No credit card needed.

> Brevo may ask a couple of onboarding questions ("how will you send email?"). Pick
> **transactional / API**; it doesn't change anything technical.

---

## Step 2 — Verify the sender address (REQUIRED)

Brevo will only send "from" an address you've proven you control. This is the single
most common reason email fails, so do it carefully.

1. In the Brevo dashboard, open **Senders, Domains & Dedicated IPs**
   (top-right menu under your account name → **Senders & Domains**), then the
   **Senders** tab. Direct link: **https://app.brevo.com/senders/list**
2. Click **Add a sender**.
3. Fill in:
   - **From name:** `SugboWay`
   - **From email:** an address you can open right now (e.g. your Gmail like
     `youraddress@gmail.com`, or an address on a domain you own).
4. Click **Save**. Brevo emails that address a **confirmation link** — open your inbox
   (check Spam) and click it.
5. Back on the Senders list, the address should now show a green **Verified** /
   checkmark. ✅

**Remember the exact From name + email you verified** — you'll reuse them as
`EMAIL_FROM` in Step 4. They must match.

> A plain Gmail sender works for testing. For production deliverability, verifying a
> whole **domain** (next step, optional) is better, but not required to start.

### Step 2b (optional, better deliverability) — verify a domain

If you own a domain (e.g. `sugboway.app`):
1. **Senders & Domains → Domains → Add a domain**.
2. Brevo gives you DNS records (an SPF `TXT`, a DKIM `TXT`/CNAME, and often a DMARC
   record). Add them at your domain registrar's DNS settings.
3. Wait for Brevo to show the domain **Authenticated**. Then you can send from any
   address on that domain (e.g. `no-reply@sugboway.app`).

---

## Step 3 — Generate an API key

1. Open **SMTP & API** (account menu → **SMTP & API**), then the **API Keys** tab.
   Direct link: **https://app.brevo.com/settings/keys/api**
2. Click **Generate a new API key**.
3. Name it `sugboway` → **Generate**.
4. **Copy the key now** (it starts with `xkeysib-…`). Brevo only shows it once. If you
   lose it, just generate another and update Render.

> This is a secret — treat it like a password. It only ever lives in Render's
> Environment tab, never in the code or git.

---

## Step 4 — Set the values in Render

Render dashboard → open **sugboway-routing-api** → **Environment** → add these:

| Key | Value | Notes |
|---|---|---|
| `BREVO_API_KEY` | `xkeysib-…` | the key from Step 3 |
| `EMAIL_FROM` | `SugboWay <youraddress@gmail.com>` | **must equal the sender you verified in Step 2** (display name + the verified email) |
| `APP_BASE_URL` | `https://sugboway-web.onrender.com` | your **web** URL, no trailing slash |
| `PUBLIC_API_URL` | `https://sugboway-routing-api.onrender.com` | this **API's** URL, no trailing slash |

Click **Save Changes**. Render redeploys the service automatically.

> You do **not** need any `SMTP_*` variables when using Brevo. If `BREVO_API_KEY` is
> set, the app uses Brevo and ignores SMTP.

---

## Step 5 — Confirm it works

1. After the redeploy shows **Live**, open the routing-API **Logs** in Render. On boot
   you should see:
   ```
   [SugboWay Routing API] Email: using Brevo HTTP API.
   ```
2. In the web app: **Profile → Create account** → enter your **full name**, a real email
   you can open, and a password (≥8 chars).
3. Watch the logs while you submit — you should see:
   ```
   [auth] verification email sent to you@example.com
   ```
4. Check that inbox (and **Spam**) for *Verify your SugboWay account*. Click the link →
   you're redirected to the app with "please sign in" → sign in → you're in. ✅

### Optional API smoke test
```bash
curl -X POST https://sugboway-routing-api.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"you@example.com","password":"testpass123"}'
# expect: {"status":"verify_email"}
```
Then watch the logs for the `verification email sent` line.

---

## Troubleshooting (read the routing-API logs first)

| Log line / symptom | Cause | Fix |
|---|---|---|
| `Email: using SMTP.` on boot | `BREVO_API_KEY` not set | Add `BREVO_API_KEY` in Render → redeploy |
| `WARNING: no email provider configured` | neither Brevo nor SMTP set | Add `BREVO_API_KEY` (+ `EMAIL_FROM`) |
| `brevo api 401: … unauthorized` | wrong/disabled API key | Regenerate the key (Step 3), update Render |
| `brevo api 400: … sender not valid` / `... is not a valid sender` | `EMAIL_FROM` isn't a verified Brevo sender | Make `EMAIL_FROM`'s address exactly the one you verified in Step 2 |
| `brevo api 400: … recipient` | malformed recipient email | n/a for normal sign-ups; check the address |
| Logs say `verification email sent` but nothing arrives | In Spam, or recipient blocked | Check Spam; for production verify a domain (Step 2b) |
| Verify link 404 / wrong redirect | `PUBLIC_API_URL` / `APP_BASE_URL` wrong | Use exact `https` URLs, no trailing slash |
| Hit the 300/day free cap | Brevo daily limit | Wait for reset or upgrade the Brevo plan |

---

## Quick checklist

- [ ] Brevo account created (free plan).
- [ ] A sender address **verified** (green check in Senders).
- [ ] API key generated and copied (`xkeysib-…`).
- [ ] Render `sugboway-routing-api` → `BREVO_API_KEY` set.
- [ ] `EMAIL_FROM` = the verified sender (name + email match exactly).
- [ ] `APP_BASE_URL` and `PUBLIC_API_URL` set (https, no trailing slash).
- [ ] Service redeployed; logs show `Email: using Brevo HTTP API.`
- [ ] Test sign-up → `verification email sent` in logs → email received → verified → signed in.
