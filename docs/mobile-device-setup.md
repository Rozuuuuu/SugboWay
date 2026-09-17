# SugboWay Mobile — getting it onto a phone

Everything in `sugboway-mobile/` up to Task 11 is written and reviewed, but **none of it has
ever run on a device.** 60 passing tests are evidence about code, not about an app. This guide
covers getting the first build onto real hardware, and what the three device-dependent tasks
still need from you.

Read `sugboway-mobile/AGENTS.md` first if you are touching the code — it carries the traps this
port has already hit.

---

## 1. Why a normal Expo Go run will not work

Expo Go cannot load this app. It bundles a fixed set of native modules, and this project uses
four it does not ship: MapLibre, `expo-location`'s background mode, `expo-notifications`, and
`expo-secure-store`. You need a **development build** — your own APK with your own native
modules compiled in.

You will rebuild that dev client **three more times** before the project is done: after Task 14
(background location), Task 15 (notifications), and Task 19 (Google Sign-In). Each adds native
code that a JavaScript reload cannot pick up. Budget for that rather than being surprised by it.

---

## 2. First build

You need a free Expo account (expo.dev) and a physical Android phone. An emulator will do for a
first look, but **not** for Tasks 13–15 — emulators do not reproduce GPS drift, real
connectivity loss, or doze-mode battery behaviour, which is exactly what those tasks are about.

```bash
cd C:\Users\Home\Desktop\Sugboway\SugboWay\sugboway-mobile

npm install -g eas-cli
eas login
eas build:configure          # creates/updates eas.json — commit the result
eas build --profile development --platform android
```

The build runs in Expo's cloud and takes roughly 10–20 minutes on the free tier, longer when
queues are busy. It ends with a URL. Open that on the phone, download the APK, and install it —
Android will ask you to allow installs from unknown sources.

Then, from the same directory:

```bash
npx expo start --dev-client
```

Scan the QR code with the installed app. It connects to your machine and loads the JavaScript.
From then on, code changes reload instantly; only native changes need a rebuild.

### If the build fails

Two things in this project are the likely culprits, both already documented:

- **A missing peer dependency.** `npm install` here needs `--legacy-peer-deps`, which disables
  automatic peer installation. It has silently dropped **eight** packages so far, two of which
  would have broken the build. If the error names a module that should obviously be present,
  check it exists in both `package-lock.json` and `node_modules/` before believing anything else.
- **A Gradle or SDK version conflict**, most likely around `react-native-worklets` or
  `babel-preset-expo`, both of which have already needed hand-fixing here.

Send me the failure output rather than guessing — these errors point nowhere near their cause.

---

## 3. What to check on that first build

In rough order of what is most likely to be wrong:

1. **The four tabs open and switch** — Routes, Traffic, Ask SugboWay, Profile.
2. **Fonts render** — condensed Saira on headings, JetBrains Mono on route codes. If they look
   like system defaults, font loading failed.
3. **Light/dark**. This is the one I would check most carefully. The entire theme rests on a
   single root `dark` class propagating through CSS variables. It is architecturally verified but
   has never been *seen*. If the app does not visibly change, stop and tell me.
4. **Search a real route** — say Ayala to Colon. Expect the first request to take **~30 seconds**:
   the Neon database autosuspends and takes that long to wake. This is normal, measured, and the
   loading copy says so. Subsequent searches take well under a second.
5. **The map draws.** Basemap, a vermilion route line, white stop dots, and the camera framing
   the route. If every route renders as a perfectly straight line between two points, the
   route-shape contract has regressed — that specific bug was caught in review and fails silently.

---

## 4. The three device-dependent tasks

These are the reason this port is justified as a capstone: each is something a browser genuinely
cannot do. They are also the three I cannot verify for you.

### Task 13 — Offline maps

Downloads real MapLibre tiles for Metro Cebu (`123.82,10.25 → 123.96,10.42`, zoom 10–16) so the
map works with no connection.

**You need to:** tap "Download offline map" in Profile, watch it complete, then enable airplane
mode, restart the app, and confirm the map still renders.

**Worth knowing:** this replaces a feature that never worked on web —
`sugboway-web/public/cebu-tiles.pmtiles` is an 80-byte placeholder file, so the web app's offline
mode has always been broken. Also measure the download size; if it is unreasonable on a budget
phone, the zoom range needs narrowing.

**Record this one.** It is the strongest single demo in the project.

### Task 14 — Background GPS

Keeps stop-approach detection alive with the screen off, via a foreground service.

**You need to:** start navigating a route, lock the phone, and physically move toward the
destination — or use `adb` mock locations. Confirm the alert fires while locked.

**Test on a cheap Android phone, not a flagship and not an emulator.** Budget devices ship
aggressive OEM battery managers that kill background work, and that is the hardware your actual
users have. If it works on a Pixel and dies on a low-end handset, you have learned the more
important fact.

### Task 15 — Notifications

Turns the approach alert into a real lock-screen notification with haptics.

**You need to:** confirm it appears on the lock screen, and that muting suppresses both the
notification and the vibration.

---

## 5. Task 19 — Google Sign-In needs a console step

This one fails **silently** if skipped, which is why it deserves its own section.

The Go API verifies the Google ID token's audience equals your existing **web** client ID.
`@react-native-google-signin` mints tokens with that audience when configured with `webClientId`,
so **no backend change is needed**. But Android sign-in additionally requires an Android OAuth
client registered against the APK's signing fingerprint:

```bash
eas credentials        # read the SHA-1 of the Android keystore EAS manages
```

Then in Google Cloud Console → Credentials, create an **OAuth client ID → Android** with package
name `ph.sugboway.app` and that SHA-1. Leave the existing Web client ID untouched — it stays the
audience.

Verify on a **`preview`** build, not only `development`: the two profiles can use different
signing keys, and a fingerprint registered for one will pass in development and fail in the build
you actually demo.

---

## 6. Honest status

| Layer | State |
|---|---|
| Skeleton, tokens, primitives, domain, API client, theme, auth, search, cards, map, camera | Written, reviewed, 60 tests |
| Anything at all on a phone | **Never run** |
| Offline maps, background GPS, notifications | Not built yet, and unverifiable without you |

The gap between "reviewed" and "working" is entirely about this step. Nine defects were caught in
review — including one where every route would have silently drawn as a straight line — but no
review catches a layout that is unreadable at arm's length on a 5-inch screen in daylight.
