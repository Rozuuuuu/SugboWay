# CORS origin hardening

How cross-origin access is configured across SugboWay, what to set before a
production deploy, and the framework-specific footguns to avoid. Both backends
already restrict origins to an allowlist (never `*`); this doc is the operator's
reference for keeping that allowlist correct.

## Why CORS matters here

The browser talks **directly** to the Go routing API and the Python AI service
(`NEXT_PUBLIC_ROUTING_API_URL` / `NEXT_PUBLIC_AI_API_URL`) — there is no Next.js
proxy in front of them. So each backend must decide, on its own, which web
origins are allowed to read its responses from a browser. A too-permissive
allowlist lets a malicious site issue requests from a logged-in victim's browser
and read the results (route data, and — for `/chat` — the user's authenticated
AI quota).

Auth is carried as an `Authorization: Bearer` header (a JWT in `localStorage`),
**not** a cookie. That matters for the trade-offs below: a `Bearer` header is
attached by the app's own JavaScript, not auto-sent by the browser, so the
classic "cookie silently rides along cross-site" attack does not apply. The
allowlist is still the control that stops another origin's JavaScript from
reading responses.

## Where it's configured

| Service | File | Env var | Default |
| --- | --- | --- | --- |
| Routing API (Go / Fiber) | `sugboway-routing-api/main.go` (~L143) | `ALLOWED_ORIGINS` | `APP_BASE_URL` + `http://localhost:3000` |
| AI service (Python / Starlette) | `sugboway-ai-service/main.py` (~L32) | `ALLOWED_ORIGINS` | `https://sugboway-web.onrender.com` + `http://localhost:3000` |

Both read a **comma-separated** list. Each entry is a full origin —
`scheme://host[:port]` — matched exactly.

```ini
# correct
ALLOWED_ORIGINS=https://sugboway-web.onrender.com

# wrong — these will NOT match a request from https://sugboway-web.onrender.com
ALLOWED_ORIGINS=sugboway-web.onrender.com            # missing scheme
ALLOWED_ORIGINS=https://sugboway-web.onrender.com/   # trailing slash
ALLOWED_ORIGINS=https://*.onrender.com               # wildcard host not supported
```

## Production checklist

1. **Set `ALLOWED_ORIGINS` explicitly on both services** to your real web
   origin(s). Don't rely on the defaults — the Go default includes
   `http://localhost:3000`, which you don't want trusted in production.
2. **One entry per exact origin.** Include every origin the app is actually
   served from (e.g. an apex domain *and* a `www.` host are two origins; `http`
   and `https` are two origins — list only `https`).
3. **No `*`, ever.** See the framework gotchas below for why this is worse than
   it looks on each stack.
4. **Drop `localhost`** from the production value unless you deliberately test
   against prod from a local browser.
5. **Keep the two services in sync.** The web app calls both; if an origin is
   allowed on one and not the other, half the app breaks in a confusing way.
6. **Match the scheme to reality.** Production is HTTPS-only, so every entry
   should be `https://…`.

Example production values:

```bash
# sugboway-routing-api (Render env)
ALLOWED_ORIGINS=https://sugboway-web.onrender.com

# sugboway-ai-service (Render env) — keep identical
ALLOWED_ORIGINS=https://sugboway-web.onrender.com
```

## Framework gotchas

### Go / Fiber (routing API)

- **Never combine `AllowOrigins: "*"` with credentials.** Fiber's CORS
  middleware **panics at startup** if `AllowOrigins` is `*` while
  `AllowCredentials` is true. We keep `AllowCredentials` at its default (false),
  which is correct because auth is a `Bearer` header, not a cookie — so leave it
  that way. If you ever switch auth to cookies you must set specific origins
  *and* `AllowCredentials: true`, and `*` becomes impossible (by design).
- The allowlist is a single comma-separated string passed straight to
  `cors.Config{AllowOrigins: …}`. Whitespace around entries is not trimmed by
  Fiber the way it is in the Python service — don't put spaces after the commas.

### Python / Starlette (AI service)

- **`allow_credentials=True` + `allow_origins=["*"]` is a trap.** Starlette will
  then reflect the caller's `Origin` back in `Access-Control-Allow-Origin` and
  allow credentials — effectively "wildcard with credentials," which lets *any*
  site make authenticated cross-origin calls. Setting `ALLOWED_ORIGINS=*` here
  is therefore strictly worse than on the Go side. **Do not set `*`.** Keep the
  explicit list.
- Entries are trimmed (`o.strip()`) and empty entries dropped, so
  `a, b` and `a,b` both work — but still prefer no spaces for consistency with
  the Go side.

## Verifying the config

After setting the env vars and (re)deploying, confirm a preflight from an
**allowed** origin is accepted and a **disallowed** one is not. Replace the URL
with each backend.

```bash
# Allowed origin — expect the request origin echoed in Access-Control-Allow-Origin
curl -si -X OPTIONS https://<routing-api-host>/api/v1/routes \
  -H "Origin: https://sugboway-web.onrender.com" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control-allow-origin

# Disallowed origin — expect NO Access-Control-Allow-Origin header (or not this origin)
curl -si -X OPTIONS https://<routing-api-host>/api/v1/routes \
  -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control-allow-origin
```

A correctly hardened service returns an `Access-Control-Allow-Origin` header
only for origins in the allowlist. If `https://evil.example` is echoed back, the
allowlist is misconfigured (most likely set to `*`).

## Related build-time note

The web app's own `NEXT_PUBLIC_ROUTING_API_URL` / `NEXT_PUBLIC_AI_API_URL` are
**baked in at build time** (see `CLAUDE.md`). Changing which backend the web app
calls requires a **rebuild** of the web service, not just an env change — and
the backend's `ALLOWED_ORIGINS` must include wherever that rebuilt web app is
served from.
