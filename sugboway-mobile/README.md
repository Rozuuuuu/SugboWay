# sugboway-mobile

Android port of the SugboWay web app ("Cultural Bridge"), built with Expo + `expo-router`.
This is a native counterpart to `sugboway-web/`, talking to the same
`sugboway-routing-api/` and `sugboway-ai-service/` backends over HTTP. No backend or web
code lives here or is modified by this project.

## Status

Skeleton only (Task 1 of the mobile port plan): a four-tab `expo-router` shell with
placeholder screens. No styling, maps, location, or notifications yet — those land in
later tasks.

## Stack

- Expo SDK 57 (`expo` ~57.0.21), React Native 0.86, React 19
- `expo-router` for file-based navigation (tabs: Routes, Traffic, Ask SugboWay, Profile)
- TypeScript, strict mode

## Requirements

- Android only for now — no iOS configuration is maintained.
- Package name: `ph.sugboway.app`.

## Development

```bash
npm install
npx expo start --dev-client
```

A development build is required (see the mobile port plan's Task 1, Step 7) — this app
uses native modules (expo-router, safe-area-context, screens) that Expo Go alone may not
fully support once later tasks add MapLibre/location/notifications.

## Scripts

- `npm run android` — start Metro for Android
- `npm run web` — start Metro for web (debugging only; this app targets Android)
