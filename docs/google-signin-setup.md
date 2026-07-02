# Google Sign-In Setup

Google sign-in is optional — it turns on only when the OAuth client ID is set on both
services. Until then, the "Continue with Google" button is hidden and the endpoint
returns 503.

## 1. Create an OAuth client ID (Google Cloud Console)
1. Go to https://console.cloud.google.com → create or pick a project.
2. **APIs & Services → OAuth consent screen** → set it up (External; app name "SugboWay";
   add your email). You can keep it in "Testing" while developing.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
4. Application type: **Web application**.
5. **Authorized JavaScript origins** — add your web origins (no path, no trailing slash):
   - `https://sugboway-web.onrender.com`
   - `http://localhost:3000`
6. Create → copy the **Client ID** (looks like `1234-abc.apps.googleusercontent.com`).
   (No client secret is needed for this flow.)

## 2. Set it on both services
- **Render → sugboway-routing-api → Environment:** `GOOGLE_CLIENT_ID` = the client ID.
- **Web (sugboway-web):** `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = the SAME client ID.
  This is a **build-time** variable, so you must **rebuild** the web service after setting it.

## 3. Verify
- Routing-API logs show `Google sign-in: enabled.` on boot.
- The auth modal shows a "Continue with Google" button. Signing in creates a verified,
  Free account (or logs into your existing account if the email matches).
