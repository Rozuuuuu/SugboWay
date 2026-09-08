# React Native Mobile App (`sugboway-mobile`) — Design

**Date:** 2026-09-09
**Status:** Approved (pending spec review)

## 1. Goal

Ship SugboWay as a real Android application built with **React Native (Expo)**, at full
feature parity with `sugboway-web` (all four tabs), distributed as a **sideloadable
`.apk`** — no Play Store listing.

Three things motivate this, and they rank in this order:

1. **Capstone requirement.** React Native is required by the project spec.
2. **Native capabilities the browser cannot provide** — background GPS while the screen
   is locked, real system notifications, and genuinely offline map tiles.
3. **Installable + offline** — a home-screen app that keeps working when connectivity
   drops, which is the realistic condition for a commuter in Metro Cebu.

The existing web app is already mobile-first and stays deployed. This is an **addition,
not a replacement**.

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Framework | **Expo + React Native**, TypeScript. Managed workflow with config plugins. |
| Platforms | **Android only.** iOS is out of scope (needs a paid Apple account; stricter background-location review). |
| Distribution | **EAS cloud build → signed `.apk`**, shared by download link. No store submission. Avoids needing Android Studio on the dev machine. |
| Scope | **Full parity — all four tabs**: Routes (map), Traffic, Ask SugboWay (chat), Profile + auth. |
| Map engine | **`@maplibre/maplibre-react-native`**. Same style JSON and GeoJSON source/layer model as the web app; native offline packs; no API key. |
| Styling | **NativeWind v4** — Tailwind `className` survives the port; `globals.css` tokens move into a Tailwind config. |
| Navigation | **`expo-router`** file-based tabs, replacing the hand-rolled `currentTab` state. |
| Code sharing | **Copy** `domain/` + `data/places.ts` into `sugboway-mobile/`. No npm workspace — each service in this repo is self-contained, and Metro resolves symlinked workspaces badly. |
| Backends | **Unchanged.** No Go, Python, or database work in this project. |
| Web app | **Untouched and still deployed.** It remains the fallback and the desktop story. |

## 3. What already exists (portability audit)

Measured against `sugboway-web/src` (~7,145 lines of TS/TSX).

| Category | Files | Notes |
|---|---|---|
| **Copies verbatim** | `domain/types.ts`, `domain/fare.ts`, `domain/crowding.ts`, `domain/ports.ts`, `domain/index.ts`, `data/places.ts` | Pure TypeScript, zero DOM. ~1,400 lines carried over for free, including the LTFRB fare table, the BPR congestion model, and the ~45 Metro Cebu hubs with alias fuzzy-search. |
| **Near-free** | all 11 `fetch` call sites, `hooks/useCebuTime.ts`, `hooks/useCebuWeather.ts` | `fetch` is built into React Native. Only the base-URL source changes. |
| **Swap the browser API** | `AuthProvider` (`localStorage`→`expo-secure-store`), `ThemeProvider` (`matchMedia`→`Appearance`), `useOfflineMap` (`navigator.onLine`→NetInfo), `useProximityEtiquette` (`navigator.geolocation`→`expo-location`, `navigator.vibrate`→`expo-haptics`, `AudioContext`→`expo-audio`) | Mechanical, one API at a time. Logic is preserved. |
| **Genuine rewrite** | the map half of `app/page.tsx`, `components/auth/GoogleButton.tsx` | MapLibre GL **JS** does not run in React Native. The Google Identity Services web SDK has no RN equivalent. |
| **Restyle only** | `components/route/*` (RouteCard, AllRoutesPanel, FareBadge, CrowdingIndicator, PeakWarning, PlaceDropdown, ProximityAlert, RouteCodeBadge, NavigationDrawer), `BrandMark`, `SplashScreen`, `ThemeToggle`, `AuthModal`, `PricingPlans` | Structure changes (`div`→`View`, `span`→`Text`); NativeWind keeps the `className` styling. |

**`app/page.tsx` is 2,116 lines** holding the shell, map, and all four tabs. Splitting it
into four screens plus a map component is the structural win of this port, and would be
worth doing even if the target were not mobile.

**Known defect inherited from web, fixed here:** `sugboway-web/public/cebu-tiles.pmtiles`
is an **80-byte placeholder** whose contents are the literal string
`PMTiles_Placeholder_Metro_Cebu_z10_z16_Boundaries_123.82_10.25_to_123.96_10.42`. The
offline basemap has never worked — `offline-style.json` points at tile data that was
never generated. The mobile app does **not** port this stub; see §8.1.

## 4. Architecture

```
sugboway-mobile (Expo / React Native / Android)
  │
  ├─ expo-router tabs ──> Routes | Traffic | Ask SugboWay | Profile
  │
  ├─ domain/ (copied, pure TS) ── fare · crowding · types · ports
  │     └─ ports.ts keeps the anti-hallucination contract: the app never
  │        computes routes locally; it renders verified backend output.
  │
  ├─ lib/api.ts ── fetch wrapper over two base URLs (expo-constants)
  │     ├──────> Go routing API  /api/v1/*   (routes, fares, congestion, auth, weather)
  │     └──────> Python AI svc   /api/v1/chat (Gemini, JWT-gated quota)
  │
  └─ native ── expo-location (background) · expo-notifications
               expo-secure-store (JWT) · MapLibre OfflineManager

Backends, database, and sugboway-web: UNCHANGED.
```

The hexagonal rule from `CLAUDE.md` is preserved: routing, fare, and spatial logic stay
pure and isolated from I/O, and the AI narrates verified tool output rather than
computing routes.

## 5. Project layout

```
sugboway-mobile/
├─ app/                      # expo-router
│  ├─ _layout.tsx            # root: providers (theme, auth), splash
│  ├─ (tabs)/_layout.tsx     # the 4-tab bar
│  ├─ (tabs)/index.tsx       # Routes  (was currentTab === "map")
│  ├─ (tabs)/traffic.tsx     # Traffic (was "rush")
│  ├─ (tabs)/chat.tsx        # Ask SugboWay (was "chat")
│  ├─ (tabs)/profile.tsx     # Profile (was "profile")
│  ├─ auth.tsx               # modal route (was AuthModal overlay)
│  └─ pricing.tsx            # modal route (was PricingPlans overlay)
├─ components/
│  ├─ map/MapView.tsx        # MapLibre RN: track + stops + markers
│  ├─ route/                 # ported route components
│  └─ ...
├─ domain/                   # COPIED from sugboway-web/src/domain
├─ data/places.ts            # COPIED from sugboway-web/src/data
├─ hooks/                    # ported hooks, native APIs swapped in
├─ lib/api.ts                # API client + base URLs
├─ theme/tailwind.config.js  # sand/sea tokens from globals.css
├─ tasks/locationTask.ts     # TaskManager background GPS task
├─ app.config.ts             # Expo config, plugins, extra.*
└─ eas.json                  # build profiles
```

## 6. Screens & navigation

`expo-router` tabs replace the `currentTab` state machine and the four
`className={... : "hidden"}` blocks. Tab identity, order, and header titles match the web
app exactly (Routes / Traffic / Ask SugboWay / Profile) so the two frontends stay
recognisably the same product.

The header keeps the live Cebu time and weather chip (`useCebuTime`, `useCebuWeather`).
`AuthModal` and `PricingPlans` become `expo-router` modal routes rather than conditionally
rendered overlays — the native back gesture then dismisses them for free.

**Behaviour preserved:** the web app parks a single map element and moves it between route
cards so the map never re-initialises. React Native's declarative model makes this
unnecessary — one `MapView` lives on the Routes screen and its data changes by prop.

## 7. The map

| Web (MapLibre GL JS) | Mobile (MapLibre RN) |
|---|---|
| `new maplibregl.Map({ container, style, center: [123.89, 10.31], zoom: 13 })` | `<MapView mapStyle={...}><Camera centerCoordinate={[123.89, 10.31]} zoomLevel={13} /></MapView>` |
| `map.getSource(ROUTE_TRACK_SOURCE).setData(geojson)` | `<ShapeSource shape={trackGeoJSON}><LineLayer /></ShapeSource>` |
| `map.getSource(ROUTE_STOPS_SOURCE).setData(geojson)` | `<ShapeSource shape={stopsGeoJSON}><CircleLayer /></ShapeSource>` |
| `new maplibregl.Marker(el)` from `document.createElement` | `<MarkerView>` with RN children |
| `new maplibregl.Popup().setHTML(...)` | `<MarkerView>` + RN callout component |
| `map.on("style.load", restoreRouteLayers)` — relayer after every style swap | **Deleted.** RN re-renders sources declaratively; the layer-restoration dance disappears. |
| `map.fitBounds(new LngLatBounds(...))` | `<Camera bounds={{ ne, sw }} />` |

Basemap style URLs are unchanged, so light/dark parity is preserved:
`https://basemaps.cartocdn.com/gl/positron-gl-style/style.json` and
`.../dark-matter-gl-style/style.json`.

Route geometry still comes from `GET /api/v1/route/shape?route_id=` with the existing
straight-line fallback when real road geometry is unavailable — the app does not fake a
path.

## 8. Native capabilities

### 8.1 Offline maps — replaces the PMTiles stub

MapLibre RN's `OfflineManager` downloads and stores real tiles natively. No tile-generation
pipeline, no `.pmtiles` file, no custom offline style:

```ts
await OfflineManager.createPack(
  {
    name: "metro-cebu",
    styleURL: CARTO_LIGHT,
    minZoom: 10,
    maxZoom: 16,
    bounds: [[123.82, 10.25], [123.96, 10.42]], // Metro Cebu
  },
  progressListener,
  errorListener,
);
```

Bounds and zoom range are taken from the placeholder file's own description, so coverage
matches the original intent. Exposed in Profile as a **"Download offline map"** toggle with
a progress bar and a stored-size readout, plus a delete action. Downloading is explicit and
user-initiated — never automatic on a metered connection.

`OfflineManager.setTileCountLimit()` is raised above the default before download, since
z10–z16 over Metro Cebu exceeds it.

**A pack caches the tiles and style resources for one `styleURL`.** Downloading both the
light and dark CARTO styles would roughly double storage for a cosmetic difference, so:
**one pack is created, against the light style.** While offline the map renders light even
in dark mode; the surrounding app chrome still honours the user's theme. This is a
deliberate, documented limitation, surfaced as a one-line note under the download toggle —
not a bug. Revisit only if measured pack size turns out small (see §16).

### 8.2 Background GPS

`expo-location` with `startLocationUpdatesAsync` plus a `TaskManager` task in
`tasks/locationTask.ts`. This keeps `useProximityEtiquette`'s stop-approach detection alive
with the screen off — the single capability a browser genuinely cannot deliver, and the
strongest technical justification for the native port.

Requires `ACCESS_BACKGROUND_LOCATION`, declared via the `expo-location` config plugin, and
a foreground service notification on Android while tracking is active. Permission is
requested **in context** — when the user starts navigating a route, not at first launch —
and the app degrades to foreground-only tracking if background permission is denied.

### 8.3 Notifications

`expo-notifications` fires a real system notification on stop approach, replacing the
in-page `ProximityAlert` banner. `expo-haptics` replaces `navigator.vibrate(200)`, and
`expo-audio` replaces the `AudioContext` chime. The existing mute preference moves from
`localStorage` to `AsyncStorage` under the same `sugboway_proximity_mute` key.

These are **local** notifications scheduled on-device. No push server, no FCM credentials.

### 8.4 Secure token storage

The JWT moves from `localStorage` to **`expo-secure-store`** (Android Keystore) — a genuine
security improvement over the web app, worth stating in the defense.

## 9. Auth on mobile

Email/password, verification, and tier handling are unchanged: the app POSTs to the Go API
under `/api/v1/auth/*` and stores the returned JWT. The Python service keeps enforcing the
per-tier chat quota (**Free 10/hr, Pro 100/hr, Max unlimited; guest 5/hr per IP**) from the
`Authorization: Bearer` header.

**Google Sign-In is the one part that cannot be ported directly.** `GoogleButton.tsx` loads
the Google Identity Services *web* SDK via `document.createElement("script")`, which has no
React Native equivalent. It is replaced by `@react-native-google-signin/google-signin`.

The important detail: the Go API verifies the ID token's **audience equals
`GOOGLE_CLIENT_ID`**. Android OAuth clients have a *different* client ID, so a naive port
would fail audience validation. The library's `webClientId` option mints ID tokens carrying
the **existing web client ID** as the audience — so:

- **No backend change is required.** `POST /api/v1/auth/google` works as-is.
- An **Android OAuth client must still be registered** in Google Cloud Console with the
  APK's SHA-1 signing fingerprint, or sign-in fails silently on device. EAS-managed signing
  means the fingerprint comes from `eas credentials`, not from a local keystore.

As on web, the feature is optional: when the client ID is unset the button is hidden and
the endpoint returns 503.

## 10. Config & environment

`NEXT_PUBLIC_*` build-time inlining is replaced by Expo's `extra` block, read through
`expo-constants`:

```ts
// app.config.ts
extra: {
  routingApiUrl: process.env.ROUTING_API_URL,
  aiApiUrl: process.env.AI_API_URL,
  googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
}
```

Same caveat as the web app: these are **baked in at build time**, so a changed backend URL
requires a new APK, not just a restart. Values are non-secret (public URLs and a public
OAuth *client* ID); no API keys ship in the bundle. The weather key stays server-side behind
`GET /api/v1/weather`.

**Endpoints consumed** (all existing, none new):

| Service | Endpoint |
|---|---|
| Go | `/api/v1/route/search`, `/api/v1/routes/serving`, `/api/v1/route/shape`, `/api/v1/route/stops`, `/api/v1/routes`, `/api/v1/routes/passing`, `/api/v1/stops/nearby`, `/api/v1/congestion`, `/api/v1/weather`, `/api/v1/auth/*` |
| Python | `/api/v1/chat` |

`ALLOWED_ORIGINS` on the Go API needs no change: native apps send no `Origin` header, so
CORS does not apply to them.

## 11. Offline & resilience

`@react-native-community/netinfo` replaces the `online`/`offline` window events and drives
two behaviours:

1. **Basemap** — switch to the downloaded offline pack when connectivity drops (the light
   pack, per §8.1). If no pack has been downloaded, the map shows an explicit "offline, no
   map downloaded" state rather than an empty grey canvas.
2. **Data** — keep the existing mock-route fallback so the Routes screen still renders when
   the backend is unreachable, swapping to live data once it returns.

This mattered on web; it matters more on mobile, where connectivity genuinely drops mid-trip.
Neon's autosuspend (~1s cold start on first request after idle) is handled by a loading state
rather than an aggressive timeout.

The parallel `Promise.allSettled` search — Dijkstra results plus geometric direct routes,
where a 404 means "no scheduled-graph route" rather than an error — ports as-is. It is
already the right shape for flaky networks.

## 12. Styling & design tokens

NativeWind v4 keeps `className` working. The tokens move from `globals.css` (Tailwind v4
`@theme`) into `tailwind.config.js`.

**Note:** `CLAUDE.md` describes the design system as "sand/sea palette, Cebu Blue
`#0056B3`, Plus Jakarta Sans, JetBrains Mono". That is **stale** — `globals.css` has since
been redesigned as **"Signboard"**, grounded in the Cebu jeepney destination board. The
real tokens are:

| Token | Light | Dark |
|---|---|---|
| Accent (`--color-cebu-blue`, historical name retained) | `#c0392b` enamel vermilion | — |
| `--sw-enamel` | `#c0392b` | `#da3e2e` |
| `--color-surface` | `#eff0ed` cool steel paper | (see `.dark` block) |
| `--color-on-surface` | `#191c1e` ink | — |
| Crowding-reserved | `--color-safe-green` `#1f7a43`, `--color-alert-amber` `#c9791a` | — |

Fonts are **Hanken Grotesk** (`--font-sans`, body), **Saira Condensed**
(`--font-display` / `--font-signboard`), and **JetBrains Mono** (`--font-mono`, route-code
badges), loaded via `expo-font` instead of `next/font/google`.

**Two things NativeWind cannot carry over on its own:**

1. **`.sw-*` component classes** — `sw-card`, `sw-card-lit`, `sw-btn-primary`,
   `sw-brand-tile`, `sw-fill-sea`, `sw-text-gradient` are hand-written CSS rules in
   `globals.css`, not Tailwind utilities, so NativeWind will not see them. They become RN
   presentational components (`<Card>`, `<PrimaryButton>`, `<BrandTile>`). Their hover
   variants drop (no cursor on touch) and become pressed states; `box-shadow` becomes RN
   `elevation` on Android.
2. **Material Symbols Outlined** — the app uses the Google icon *web font* via
   `className="material-symbols-outlined"` in 25+ places in `page.tsx` alone. There is no
   web font equivalent in RN. Icons are remapped one-for-one onto
   `@expo/vector-icons/MaterialIcons`, whose glyph names largely match the Material Symbols
   ligature names already in use.

Full light/dark theming is preserved; `ThemeProvider` swaps `window.matchMedia` for RN's
`Appearance` API and `localStorage` for `AsyncStorage` under the same `sugboway-theme` key.
The one exception is the basemap while offline, which is light-only (§8.1).

**Known gaps to handle manually:** `backdrop-blur` (use `expo-blur`), some gradient
utilities (use `expo-linear-gradient`), and hover states (no cursor on touch — these become
pressed states).

Use the `BrandMark` SVG component via `react-native-svg`. **Do not use `public/Logo.png`** —
it is a 1536x1024 mockup with a baked-in backdrop that turns to mush at small sizes.

Dark mode uses NativeWind's **class strategy**, matching the web app's
`@custom-variant dark (&:where(.dark, .dark *))` rather than following the OS blindly, so
the existing three-state theme toggle (light / dark / system) keeps working.

## 13. Build & distribution

EAS profiles in `eas.json`:

| Profile | Output | Use |
|---|---|---|
| `development` | dev client `.apk` | day-to-day work with fast refresh **and** native modules available |
| `preview` | standalone `.apk` | what you hand to testers and the panel |
| `production` | standalone `.apk` | the final defended build |

**Expo Go is not usable for this project** — background location, notifications, and
MapLibre are native modules it does not bundle. A **development build** is required from
day one. This is the most common way an Expo project loses a day, so it is front-loaded in
the sequencing below.

## 14. Testing

Stated plainly: **`sugboway-web` has no test runner and no `npm test` script**, so there is
no existing suite to port.

- **`jest-expo` unit tests on the copied `domain/`** — `calculateFare` (LTFRB distance bands,
  student/senior/PWD discounts, PHP rounding) and `crowding` (`bprTravelTime`,
  `volumeToScore`, `classifyCrowding` thresholds). These are pure functions; tests are cheap
  and this is the one place they clearly pay off. It also mirrors the Go side, where
  `domain/` is the tested layer.
- **Manual device verification** for the map, GPS, offline packs, and notifications.
  Emulators do not faithfully reproduce GPS drift, connectivity loss, or doze-mode
  background behaviour — these must be checked on a real Android phone.
- **A recorded offline test** — enable airplane mode and confirm the map still renders and
  the mock-route fallback engages. Worth capturing on video for the defense.

## 15. Sequencing

Skeleton first, then vertical slices. Every milestone ends with an installable APK, so
there is always something demonstrable.

| # | Milestone | Done when |
|---|---|---|
| 1 | **Skeleton** — Expo app, `expo-router` 4 empty tabs, NativeWind + tokens, fonts, `lib/api.ts`, **dev build installs on a real phone** | The tab bar works on device and the API client reaches the live Go API |
| 2 | **Routes screen** — `domain/` + `places.ts` copied, search, route cards, fare, crowding, **MapLibre map with track + stops** | A real Cebu route renders end-to-end on the map |
| 3 | **Native layer** — `expo-location` background task, notifications, haptics, offline pack download in Profile | Proximity alert fires with the screen off; the map renders in airplane mode |
| 4 | **Traffic tab** — congestion/peak analytics | Parity with the web `rush` tab |
| 5 | **Chat tab** — `/api/v1/chat`, rate-limit and 429 handling | Guest and signed-in quota paths both behave |
| 6 | **Profile + auth** — email/password, secure token storage, Google Sign-In with `webClientId`, pricing modal | Sign-in works on device against the live backend |
| 7 | **Release** — `preview`/`production` EAS profiles, icon, splash, signed APK | A shareable install link |

Milestones 4 and 5 are independent of each other and of 3; they can be reordered or
parallelised if more than one person is working.

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Android **background location** is heavily restricted (doze mode, OEM battery killers common on budget phones). Behaviour varies by manufacturer. | Foreground service with a persistent notification while navigating. Test on a real budget Android device, not just an emulator. Degrade gracefully to foreground-only tracking. |
| **Google Sign-In SHA-1 mismatch** — the single most common silent failure in RN Google auth. | Pull the fingerprint from `eas credentials` and register the Android OAuth client before milestone 6. Verify on a `preview` build, not only in development. |
| **NativeWind + Tailwind v4 version skew** — NativeWind targets specific Tailwind majors. | Pin versions at milestone 1 and verify tokens render on device before porting components. If it fights back, fall back to `StyleSheet` + a `theme.ts`; the token values are the same either way. |
| **Offline pack size** — z10–z16 over Metro Cebu may be large on a cheap phone. | Measure at milestone 3. If oversized, narrow to z11–z15 or tighten the bounds to the urban core. Always show size before download and allow deletion. |
| **Domain drift** — copied `domain/` diverging from web's. | Fare and crowding logic is stable and rarely changes. If it does change, both copies get updated in the same commit; note this in `sugboway-mobile/README.md`. |
| **Backend URL baked into the APK.** | Documented in the README; a backend URL change means rebuilding, same as the web app's `NEXT_PUBLIC_*` behaviour. |
| **EAS free-tier build queue** can be slow at deadline time. | Do not leave the first `production` build until defense week. Produce a shippable APK at milestone 3. |

## 17. Out of scope

- **iOS** — no Apple Developer account; stricter background-location review.
- **App Store / Play Store submission** — sideloaded APK only.
- **Any backend change** — Go, Python, and the Neon database are untouched.
- **Retiring or modifying `sugboway-web`** — it stays deployed as the fallback and desktop story.
- **Real payments** — plan upgrades remain the existing front-end demo, as on web.
- **GTFS-RT, WebSocket crowding, Supabase, Zustand, Anthropic Claude** — all named in
  `SKILLS.md`, none of them built, none of them in this project. `SKILLS.md` remains an
  aspirational blueprint; the AI is Google Gemini (`gemini-2.5-flash`).
