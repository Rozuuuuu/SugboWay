# SugboWay Mobile (React Native) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sugboway-mobile`, an Expo / React Native Android app at full feature parity with `sugboway-web`, distributed as a sideloaded EAS-built APK.

**Architecture:** A fourth self-contained service beside the existing three. `expo-router` file-based tabs replace the 2,116-line `page.tsx` state machine; `@maplibre/maplibre-react-native` replaces MapLibre GL JS; the pure `domain/` layer is copied verbatim. The Go routing API, Python AI service, Neon database, and `sugboway-web` are **not modified by any task in this plan**.

**Tech Stack:** Expo SDK (managed) · React Native · TypeScript · expo-router · NativeWind v4 · @maplibre/maplibre-react-native · expo-location · expo-notifications · expo-secure-store · @react-native-google-signin/google-signin · jest-expo

**Spec:** `docs/superpowers/specs/2026-09-09-react-native-mobile-design.md`

## Global Constraints

- **Android only.** No iOS build, no `ios/` config, no App Store work.
- **No backend changes.** Do not edit `sugboway-routing-api/`, `sugboway-ai-service/`, or the database. If a task appears to need a backend change, stop and escalate.
- **Do not modify `sugboway-web/`.** Copy from it; never edit it.
- **All work lives under `sugboway-mobile/`.**
- **Expo Go is unusable** — background location, notifications, and MapLibre are native modules it does not bundle. A **development build** is required from Task 1 onward.
- Accent color: `#c0392b` (light) / `#da3e2e` (dark), exposed under the historical token name `cebu-blue`.
- Fonts: **Hanken Grotesk** (body), **Saira Condensed** (display/signboard), **JetBrains Mono** (route codes).
- Reserved semantics: green `#1f7a43` / amber `#c9791a` / red are **crowding-only**. Never reuse them for generic UI state.
- Metro Cebu bounds, used everywhere a bbox is needed: `[[123.82, 10.25], [123.96, 10.42]]`.
- Map default camera: center `[123.89, 10.31]`, zoom `13`.
- Basemap styles: `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json` (light), `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` (dark).
- The app **never computes routes locally** — it renders verified backend output (the `ports.ts` anti-hallucination contract).
- Commit after every task. Branch: `feat/react-native-mobile`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `app/_layout.tsx` | Root providers (theme, auth), font loading, splash |
| `app/(tabs)/_layout.tsx` | The four-tab bar |
| `app/(tabs)/index.tsx` | Routes screen — search, results, map |
| `app/(tabs)/traffic.tsx` | Traffic / congestion analytics |
| `app/(tabs)/chat.tsx` | Ask SugboWay (Gemini) |
| `app/(tabs)/profile.tsx` | Profile, offline map, settings |
| `app/auth.tsx`, `app/pricing.tsx` | Modal routes |
| `components/map/RouteMap.tsx` | MapLibre: track + stops + markers |
| `components/ui/*` | `Card`, `PrimaryButton`, `BrandTile`, `Icon` — the `.sw-*` CSS classes as components |
| `components/route/*` | Ported route components |
| `domain/*`, `data/places.ts` | **Copied verbatim** from `sugboway-web/src` |
| `lib/api.ts` | Typed fetch client over both base URLs |
| `lib/config.ts` | `expo-constants` accessor |
| `hooks/*` | Ported hooks with native APIs swapped in |
| `tasks/locationTask.ts` | TaskManager background GPS task |
| `theme/tokens.ts`, `tailwind.config.js` | Signboard tokens |
| `app.config.ts`, `eas.json` | Expo + build config |

---

## Task 1: Expo skeleton with four tabs, running on a real device

**Files:**
- Create: `sugboway-mobile/` (via `create-expo-app`)
- Create: `sugboway-mobile/app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/traffic.tsx`, `app/(tabs)/chat.tsx`, `app/(tabs)/profile.tsx`
- Create: `sugboway-mobile/.gitignore`, `sugboway-mobile/README.md`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a working `expo-router` tab shell; route names `index`, `traffic`, `chat`, `profile`

- [ ] **Step 1: Scaffold the project**

From the repo root:

```bash
npx create-expo-app@latest sugboway-mobile --template blank-typescript
cd sugboway-mobile
npx expo install expo-router expo-linking expo-constants expo-status-bar react-native-safe-area-context react-native-screens
```

- [ ] **Step 2: Point the entry point at expo-router**

In `sugboway-mobile/package.json`, set:

```json
"main": "expo-router/entry"
```

Delete the generated `App.tsx` — `expo-router` owns entry now.

- [ ] **Step 3: Add the scheme to app config**

Create `sugboway-mobile/app.config.ts`:

```ts
import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "SugboWay",
  slug: "sugboway",
  scheme: "sugboway",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  android: {
    package: "ph.sugboway.app",
    adaptiveIcon: { backgroundColor: "#c0392b" },
  },
  plugins: ["expo-router"],
};

export default config;
```

- [ ] **Step 4: Write the root layout**

Create `sugboway-mobile/app/_layout.tsx`:

```tsx
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 5: Write the tab bar**

Create `sugboway-mobile/app/(tabs)/_layout.tsx`. Titles match the web app exactly:

```tsx
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: "Routes" }} />
      <Tabs.Screen name="traffic" options={{ title: "Traffic" }} />
      <Tabs.Screen name="chat" options={{ title: "Ask SugboWay" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
```

- [ ] **Step 6: Write four placeholder screens**

Create each of `app/(tabs)/index.tsx`, `traffic.tsx`, `chat.tsx`, `profile.tsx` with the screen name substituted:

```tsx
import { Text, View } from "react-native";

export default function RoutesScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Routes</Text>
    </View>
  );
}
```

- [ ] **Step 7: Build and install a development build on a real Android phone**

This is the gate for the whole plan — do not proceed until an APK is on a physical device.

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --profile development --platform android
```

Download the resulting APK to the phone and install it. Then:

```bash
npx expo start --dev-client
```

Expected: the app opens on the phone and all four tabs switch. **Verify on a physical device, not an emulator** — emulators mislead on GPS and connectivity later.

- [ ] **Step 8: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): Expo skeleton with four expo-router tabs"
```

---

## Task 2: Signboard design tokens, NativeWind, and fonts

**Files:**
- Create: `sugboway-mobile/tailwind.config.js`, `babel.config.js`, `metro.config.js`, `global.css`, `nativewind-env.d.ts`
- Create: `sugboway-mobile/theme/tokens.ts`
- Modify: `sugboway-mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: Task 1's `_layout.tsx`
- Produces: `TOKENS` (from `theme/tokens.ts`) with `.light` and `.dark` keys; working `className` on RN components; font families `sans`, `display`, `mono`

**Source of truth:** `sugboway-web/src/app/globals.css`. Ignore `CLAUDE.md`'s description of the palette — it is stale (see spec §12).

- [ ] **Step 1: Install NativeWind and fonts**

```bash
npx expo install nativewind react-native-reanimated react-native-safe-area-context
npm install -D tailwindcss@3
npx expo install expo-font @expo-google-fonts/hanken-grotesk @expo-google-fonts/saira-condensed @expo-google-fonts/jetbrains-mono
```

Tailwind is pinned to v3 because NativeWind v4 targets it. The web app's Tailwind v4 stays untouched.

- [ ] **Step 2: Write the token module**

Create `sugboway-mobile/theme/tokens.ts`. Values copied from `globals.css`:

```ts
export const TOKENS = {
  light: {
    cebuBlue: "#c0392b",
    enamel: "#c0392b",
    enamelDeep: "#8f261a",
    safeGreen: "#1f7a43",
    alertAmber: "#c9791a",
    airconCyan: "#2b7180",
    clay: "#b8501e",
    surface: "#eff0ed",
    surfaceContainerLowest: "#ffffff",
    surfaceContainer: "#eaece7",
    surfaceVariant: "#e2e5e0",
    onSurface: "#191c1e",
    onSurfaceVariant: "#4c5453",
    outline: "#78807e",
    outlineVariant: "#c9cdc8",
    error: "#b3261e",
  },
  dark: {
    cebuBlue: "#da3e2e",
    enamel: "#da3e2e",
    enamelDeep: "#7e241a",
    safeGreen: "#1f7a43",
    alertAmber: "#c9791a",
    airconCyan: "#2b7180",
    clay: "#b8501e",
    surface: "#191c1e",
    surfaceContainerLowest: "#0f1214",
    surfaceContainer: "#1d2123",
    surfaceVariant: "#262a2c",
    onSurface: "#e2e5e0",
    onSurfaceVariant: "#c9cdc8",
    outline: "#8b9391",
    outlineVariant: "#3a4342",
    error: "#ffb4ab",
  },
} as const;
```

- [ ] **Step 3: Write the Tailwind config**

Create `sugboway-mobile/tailwind.config.js`. Dark mode uses the **class** strategy to match the web app's `@custom-variant dark`:

```js
const { TOKENS } = require("./theme/tokens");

module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "cebu-blue": TOKENS.light.cebuBlue,
        enamel: TOKENS.light.enamel,
        "safe-green": TOKENS.light.safeGreen,
        "alert-amber": TOKENS.light.alertAmber,
        "aircon-cyan": TOKENS.light.airconCyan,
        clay: TOKENS.light.clay,
        surface: TOKENS.light.surface,
        "surface-container": TOKENS.light.surfaceContainer,
        "surface-container-lowest": TOKENS.light.surfaceContainerLowest,
        "surface-variant": TOKENS.light.surfaceVariant,
        "on-surface": TOKENS.light.onSurface,
        "on-surface-variant": TOKENS.light.onSurfaceVariant,
        outline: TOKENS.light.outline,
        "outline-variant": TOKENS.light.outlineVariant,
      },
      fontFamily: {
        sans: ["HankenGrotesk_400Regular"],
        display: ["SairaCondensed_600SemiBold"],
        mono: ["JetBrainsMono_500Medium"],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 4: Wire Babel, Metro, and the CSS entry**

`babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};
```

`metro.config.js`:

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

module.exports = withNativeWind(getDefaultConfig(__dirname), { input: "./global.css" });
```

`global.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`nativewind-env.d.ts`:

```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 5: Load fonts and the stylesheet in the root layout**

Replace `sugboway-mobile/app/_layout.tsx`:

```tsx
import "../global.css";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, HankenGrotesk_400Regular, HankenGrotesk_600SemiBold } from "@expo-google-fonts/hanken-grotesk";
import { SairaCondensed_600SemiBold } from "@expo-google-fonts/saira-condensed";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";

export default function RootLayout() {
  const [loaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
    SairaCondensed_600SemiBold,
    JetBrainsMono_500Medium,
  });

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 6: Verify tokens render on device**

Temporarily set the Routes screen body to:

```tsx
<View className="flex-1 items-center justify-center bg-surface">
  <Text className="font-display text-2xl text-cebu-blue">SugboWay</Text>
  <Text className="font-mono text-on-surface-variant">13C</Text>
</View>
```

Rebuild the dev client (`eas build --profile development --platform android`) — NativeWind changes Babel config, so a JS reload is not enough. Expected: vermilion condensed "SugboWay" on steel-paper background, monospace "13C".

**If NativeWind fights the Tailwind version here, stop and fall back to `StyleSheet` + `theme/tokens.ts`** (spec §16). The token values are identical either way; only the styling syntax changes.

- [ ] **Step 7: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): Signboard design tokens, NativeWind, and fonts"
```

---

## Task 3: UI primitives replacing the `.sw-*` CSS classes

**Files:**
- Create: `sugboway-mobile/components/ui/Card.tsx`, `PrimaryButton.tsx`, `BrandTile.tsx`, `Icon.tsx`
- Test: `sugboway-mobile/__tests__/ui/PrimaryButton.test.tsx`

**Interfaces:**
- Consumes: `TOKENS` from Task 2
- Produces:
  - `<Card>{children}</Card>` — props `{ children: ReactNode; className?: string }`
  - `<PrimaryButton label: string; onPress: () => void; disabled?: boolean />`
  - `<BrandTile size?: number />`
  - `<Icon name: keyof typeof MaterialIcons.glyphMap; size?: number; color?: string />`

`globals.css` defines `.sw-card`, `.sw-btn-primary`, `.sw-brand-tile`, `.sw-fill-sea` as hand-written CSS, so NativeWind cannot see them. They become components. Hover variants drop (no cursor on touch); `box-shadow` becomes Android `elevation`.

- [ ] **Step 1: Install test tooling and icons**

```bash
npx expo install @expo/vector-icons
npm install -D jest jest-expo @testing-library/react-native @types/jest
```

Add to `package.json`:

```json
"scripts": { "test": "jest" },
"jest": { "preset": "jest-expo" }
```

- [ ] **Step 2: Write the failing test**

Create `sugboway-mobile/__tests__/ui/PrimaryButton.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react-native";
import PrimaryButton from "../../components/ui/PrimaryButton";

describe("PrimaryButton", () => {
  it("calls onPress when tapped", () => {
    const onPress = jest.fn();
    const { getByText } = render(<PrimaryButton label="Find routes" onPress={onPress} />);
    fireEvent.press(getByText("Find routes"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(<PrimaryButton label="Find routes" onPress={onPress} disabled />);
    fireEvent.press(getByText("Find routes"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- PrimaryButton`
Expected: FAIL — `Cannot find module '../../components/ui/PrimaryButton'`

- [ ] **Step 4: Implement the primitives**

`components/ui/PrimaryButton.tsx`:

```tsx
import { Pressable, Text } from "react-native";

export default function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`rounded-lg px-4 py-3 items-center ${disabled ? "bg-outline-variant" : "bg-enamel active:opacity-90"}`}
      style={{ elevation: disabled ? 0 : 2 }}
    >
      <Text className="text-white font-display text-base">{label}</Text>
    </Pressable>
  );
}
```

`components/ui/Card.tsx` — the `.sw-card` rule (hairline rule, 0.625rem radius, minimal shadow, no lift):

```tsx
import { View, type ViewProps } from "react-native";

export default function Card({ children, className = "", ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      {...rest}
      className={`bg-surface-container-lowest border border-outline-variant rounded-[10px] ${className}`}
      style={{ elevation: 1 }}
    >
      {children}
    </View>
  );
}
```

`components/ui/BrandTile.tsx` — the flat enamel plate:

```tsx
import { View } from "react-native";
import BrandMark from "./BrandMark";

export default function BrandTile({ size = 40 }: { size?: number }) {
  return (
    <View
      className="bg-enamel rounded-lg items-center justify-center"
      style={{ width: size, height: size, elevation: 2 }}
    >
      <BrandMark size={size * 0.6} />
    </View>
  );
}
```

`components/ui/Icon.tsx` — replaces the Material Symbols **web font**:

```tsx
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export default function Icon({
  name,
  size = 20,
  color,
}: {
  name: keyof typeof MaterialIcons.glyphMap;
  size?: number;
  color?: string;
}) {
  return <MaterialIcons name={name} size={size} color={color} />;
}
```

- [ ] **Step 5: Port BrandMark to react-native-svg**

```bash
npx expo install react-native-svg
```

Translate `sugboway-web/src/components/BrandMark.tsx` into `components/ui/BrandMark.tsx`, swapping `<svg>`/`<path>` for `react-native-svg`'s `<Svg>`/`<Path>`. **Do not use `public/Logo.png`** — it is a 1536×1024 mockup that turns to mush at tile size.

- [ ] **Step 6: Run the tests**

Run: `npm test -- PrimaryButton`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): UI primitives replacing .sw-* CSS classes"
```

---

## Task 4: Copy the domain layer and prove it with tests

**Files:**
- Create (copy verbatim): `sugboway-mobile/domain/{types,fare,crowding,ports,index}.ts`, `sugboway-mobile/data/places.ts`
- Test: `sugboway-mobile/__tests__/domain/fare.test.ts`, `__tests__/domain/crowding.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `calculateFare(distanceKm, passengerType, routeType) → FareBreakdown`; `formatPHP(amount) → string`; `bprTravelTime`, `volumeToScore(volume, capacity) → number`, `classifyCrowding(score) → CrowdingData`; types `RouteResult`, `RouteLeg`, `GTFSStop`, `GTFSRoute`, `Coordinate`, `PassengerType`, `CrowdingLevel`; `CEBU_PLACES: Place[]`, `searchPlaces(query, limit?) → Place[]`

These files are pure TypeScript with zero DOM references — they copy without edits.

- [ ] **Step 1: Copy the files**

```bash
cp -r sugboway-web/src/domain sugboway-mobile/domain
mkdir -p sugboway-mobile/data
cp sugboway-web/src/data/places.ts sugboway-mobile/data/places.ts
```

- [ ] **Step 2: Add the drift warning**

Append to `sugboway-mobile/README.md`:

```markdown
## Copied code

`domain/` and `data/places.ts` are **copies** of `sugboway-web/src/{domain,data}`.
They are intentionally duplicated rather than shared through an npm workspace
(Metro resolves symlinked workspaces badly). If fare or crowding logic changes,
update **both** copies in the same commit.
```

- [ ] **Step 3: Write the failing tests**

Create `sugboway-mobile/__tests__/domain/fare.test.ts`. Read the real constants in `domain/fare.ts` first and assert against them — do not invent numbers:

```ts
import { calculateFare, formatPHP } from "../../domain/fare";

describe("calculateFare", () => {
  it("charges the minimum fare for a short regular trip", () => {
    const fare = calculateFare(2, "regular", "jeepney");
    expect(fare.totalPHP).toBeGreaterThan(0);
    expect(fare.discountPHP).toBe(0);
  });

  it("applies the statutory 20% discount for students, seniors, and PWDs", () => {
    const regular = calculateFare(10, "regular", "jeepney");
    for (const type of ["student", "senior", "pwd"] as const) {
      const discounted = calculateFare(10, type, "jeepney");
      expect(discounted.totalPHP).toBeLessThan(regular.totalPHP);
    }
  });

  it("increases fare with distance", () => {
    expect(calculateFare(20, "regular", "jeepney").totalPHP)
      .toBeGreaterThan(calculateFare(5, "regular", "jeepney").totalPHP);
  });
});

describe("formatPHP", () => {
  it("renders a peso-prefixed amount", () => {
    expect(formatPHP(13)).toMatch(/13/);
  });
});
```

Create `sugboway-mobile/__tests__/domain/crowding.test.ts`:

```ts
import { volumeToScore, classifyCrowding } from "../../domain/crowding";

describe("volumeToScore", () => {
  it("returns 0 for an empty vehicle and clamps a full one to 1", () => {
    expect(volumeToScore(0, 100)).toBe(0);
    expect(volumeToScore(500, 100)).toBeLessThanOrEqual(1);
  });
});

describe("classifyCrowding", () => {
  it("classifies an empty vehicle as comfortable and a full one as packed", () => {
    expect(classifyCrowding(0.05).level).toBe("comfortable");
    expect(classifyCrowding(0.98).level).toBe("packed");
  });

  it("returns a monotonically non-decreasing severity across the range", () => {
    const order = ["comfortable", "moderate", "crowded", "packed"];
    const levels = [0, 0.25, 0.5, 0.75, 1].map((s) => order.indexOf(classifyCrowding(s).level));
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- domain`
Expected: PASS. If a fare assertion fails, **read `domain/fare.ts` and fix the test to match the real LTFRB table** — the implementation is the source of truth and is already shipping on web. Do not change `domain/fare.ts`.

- [ ] **Step 5: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): copy pure domain layer with unit tests"
```

---

## Task 5: Config accessor and API client

**Files:**
- Create: `sugboway-mobile/lib/config.ts`, `sugboway-mobile/lib/api.ts`, `sugboway-mobile/.env.example`
- Modify: `sugboway-mobile/app.config.ts`
- Test: `sugboway-mobile/__tests__/lib/api.test.ts`

**Interfaces:**
- Consumes: `RouteResult`, `GTFSStop` from Task 4
- Produces:
  - `ROUTING_API_URL: string`, `AI_API_URL: string`, `GOOGLE_WEB_CLIENT_ID: string | undefined`
  - `searchRoutes(o: Coordinate, d: Coordinate, passengerType: PassengerType, accessible: boolean) → Promise<RouteResult[]>`
  - `fetchServingRoutes(o, d, radius) → Promise<{ serving: unknown[] }>`
  - `fetchRouteShape(routeId: string) → Promise<GeoJSONFeatureCollection | null>`
  - `fetchRouteStops(routeId: string) → Promise<GTFSStop[]>`
  - `fetchCongestion(routeId: string, isPeak: boolean, weatherBeta: number) → Promise<{ flow_ratio?: number; is_peak?: boolean } | null>`
  - `fetchNearbyStops(lat, lon, radius) → Promise<GTFSStop[]>`
  - `fetchAllRoutes() → Promise<GTFSRoute[]>`
  - `fetchWeather() → Promise<unknown>`

- [ ] **Step 1: Add `extra` to the Expo config**

In `app.config.ts`, add:

```ts
  extra: {
    routingApiUrl: process.env.ROUTING_API_URL ?? "http://localhost:8080",
    aiApiUrl: process.env.AI_API_URL ?? "http://localhost:8000",
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
  },
```

Create `.env.example`:

```
ROUTING_API_URL=https://<your-routing-api>.onrender.com
AI_API_URL=https://<your-ai-service>.onrender.com
GOOGLE_WEB_CLIENT_ID=
```

These are baked in at build time, exactly like the web app's `NEXT_PUBLIC_*`. Changing a backend URL means a **new APK**, not a restart. No secrets go here.

- [ ] **Step 2: Write the config accessor**

`lib/config.ts`:

```ts
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const ROUTING_API_URL = extra.routingApiUrl ?? "http://localhost:8080";
export const AI_API_URL = extra.aiApiUrl ?? "http://localhost:8000";
export const GOOGLE_WEB_CLIENT_ID = extra.googleWebClientId;
```

- [ ] **Step 3: Write the failing test**

Create `sugboway-mobile/__tests__/lib/api.test.ts`:

```ts
import { fetchRouteStops, searchRoutes } from "../../lib/api";

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

describe("api client", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns [] when route search 404s (no scheduled-graph route is normal)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      { ok: false, status: 404, json: () => Promise.resolve(null) } as Response
    );
    await expect(
      searchRoutes({ lat: 10.36, lon: 123.91 }, { lat: 10.29, lon: 123.89 }, "regular", false)
    ).resolves.toEqual([]);
  });

  it("unwraps nearbyStops-shaped stop responses", async () => {
    jest.spyOn(global, "fetch").mockReturnValue(okJson({ stops: [{ stopId: "s1" }] }));
    await expect(fetchRouteStops("13C")).resolves.toHaveLength(1);
  });

  it("rejects on a 500 from route search", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      { ok: false, status: 500, json: () => Promise.resolve(null) } as Response
    );
    await expect(
      searchRoutes({ lat: 10.36, lon: 123.91 }, { lat: 10.29, lon: 123.89 }, "regular", false)
    ).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- api`
Expected: FAIL — `Cannot find module '../../lib/api'`

- [ ] **Step 5: Implement the client**

`lib/api.ts`. The 404-means-empty rule is copied deliberately from `page.tsx:716` — a 404 from `/route/search` means "no scheduled-graph route", which is normal for routes without `stop_times`:

```ts
import { ROUTING_API_URL, AI_API_URL } from "./config";
import type {
  Coordinate, GTFSRoute, GTFSStop, GeoJSONFeatureCollection, PassengerType, RouteResult,
} from "../domain";

async function getJson<T>(url: string, emptyOn404: T | undefined = undefined): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404 && emptyOn404 !== undefined) return emptyOn404;
    throw new Error(`${url} -> ${res.status}`);
  }
  return (await res.json()) as T;
}

export function searchRoutes(
  origin: Coordinate, dest: Coordinate, passengerType: PassengerType, accessible: boolean,
): Promise<RouteResult[]> {
  const q = `origin_lat=${origin.lat}&origin_lon=${origin.lon}&dest_lat=${dest.lat}&dest_lon=${dest.lon}`;
  return getJson<RouteResult[]>(
    `${ROUTING_API_URL}/api/v1/route/search?${q}&passenger_type=${passengerType}&accessible=${accessible}`,
    [],
  );
}

export function fetchServingRoutes(origin: Coordinate, dest: Coordinate, radius = 700) {
  const q = `origin_lat=${origin.lat}&origin_lon=${origin.lon}&dest_lat=${dest.lat}&dest_lon=${dest.lon}`;
  return getJson<{ serving: unknown[] }>(
    `${ROUTING_API_URL}/api/v1/routes/serving?${q}&radius=${radius}`, { serving: [] },
  );
}

export async function fetchRouteShape(routeId: string): Promise<GeoJSONFeatureCollection | null> {
  try {
    return await getJson<GeoJSONFeatureCollection>(
      `${ROUTING_API_URL}/api/v1/route/shape?route_id=${routeId}`,
    );
  } catch {
    return null; // no road geometry -> caller falls back to a straight line
  }
}

export async function fetchRouteStops(routeId: string): Promise<GTFSStop[]> {
  const data = await getJson<{ stops?: GTFSStop[]; nearbyStops?: GTFSStop[] }>(
    `${ROUTING_API_URL}/api/v1/route/stops?route_id=${routeId}`, {},
  );
  return data.stops ?? data.nearbyStops ?? [];
}

export async function fetchCongestion(routeId: string, isPeak: boolean, weatherBeta: number) {
  try {
    return await getJson<{ flow_ratio?: number; is_peak?: boolean }>(
      `${ROUTING_API_URL}/api/v1/congestion?route_id=${routeId}&is_peak=${isPeak}&weather_beta=${weatherBeta}`,
    );
  } catch {
    return null; // congestion is an enrichment, never a blocker
  }
}

export async function fetchNearbyStops(lat: number, lon: number, radius = 500): Promise<GTFSStop[]> {
  const data = await getJson<{ nearbyStops?: GTFSStop[] }>(
    `${ROUTING_API_URL}/api/v1/stops/nearby?lat=${lat}&lon=${lon}&radius=${radius}`, {},
  );
  return data.nearbyStops ?? [];
}

export const fetchAllRoutes = () => getJson<GTFSRoute[]>(`${ROUTING_API_URL}/api/v1/routes`, []);
export const fetchWeather = () => getJson<unknown>(`${ROUTING_API_URL}/api/v1/weather`, null);

export async function askAi(message: string, token: string | null) {
  const res = await fetch(`${AI_API_URL}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- api`
Expected: PASS, 3 tests.

- [ ] **Step 7: Verify against the live backend on device**

Temporarily call `fetchAllRoutes()` in the Routes screen and render `routes.length`. Expected: a non-zero count from the deployed Render API. Neon autosuspends, so the **first** request after idle may take ~1s — that is expected, not a bug.

- [ ] **Step 8: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): expo-constants config and typed API client"
```

---

## Task 6: Theme provider (Appearance + AsyncStorage)

**Files:**
- Create: `sugboway-mobile/components/ThemeProvider.tsx`
- Modify: `sugboway-mobile/app/_layout.tsx`
- Test: `sugboway-mobile/__tests__/theme.test.tsx`

**Interfaces:**
- Consumes: Task 2 tokens
- Produces: `useTheme() → { theme: "light" | "dark" | "system"; resolved: "light" | "dark"; setTheme(t) }`

Ports `sugboway-web/src/components/ThemeProvider.tsx`: `window.matchMedia` → RN `Appearance`, `localStorage` → `AsyncStorage`, **same storage key `sugboway-theme`** so the mental model matches web.

- [ ] **Step 1: Install AsyncStorage**

```bash
npx expo install @react-native-async-storage/async-storage
```

- [ ] **Step 2: Write the failing test**

```tsx
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import ThemeProvider, { useTheme } from "../components/ThemeProvider";

function Probe() {
  const { resolved } = useTheme();
  return <Text>{resolved}</Text>;
}

it("resolves to a concrete light or dark value", async () => {
  const { getByText } = render(<ThemeProvider><Probe /></ThemeProvider>);
  await waitFor(() => expect(getByText(/light|dark/)).toBeTruthy());
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- theme`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Appearance } from "react-native";

type Theme = "light" | "dark" | "system";
const KEY = "sugboway-theme";

const Ctx = createContext<{ theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void }>({
  theme: "system", resolved: "light", setTheme: () => {},
});

export const useTheme = () => useContext(Ctx);

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [system, setSystem] = useState<"light" | "dark">(Appearance.getColorScheme() ?? "light");

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v) setThemeState(v as Theme); });
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme ?? "light"));
    return () => sub.remove();
  }, []);

  const setTheme = (t: Theme) => { setThemeState(t); AsyncStorage.setItem(KEY, t); };
  const resolved = theme === "system" ? system : theme;

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 5: Apply the dark class at the root**

In `app/_layout.tsx`, wrap the stack in `<ThemeProvider>` and put the resolved theme on a root `View` so NativeWind's class strategy sees it:

```tsx
<View className={resolved === "dark" ? "dark flex-1" : "flex-1"}>
```

- [ ] **Step 6: Run the test**

Run: `npm test -- theme`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): theme provider using Appearance and AsyncStorage"
```

---

## Task 7: Auth provider with SecureStore

**Files:**
- Create: `sugboway-mobile/lib/authApi.ts`, `sugboway-mobile/components/AuthProvider.tsx`
- Modify: `sugboway-mobile/app/_layout.tsx`
- Test: `sugboway-mobile/__tests__/auth.test.tsx`

**Interfaces:**
- Consumes: `ROUTING_API_URL` from Task 5
- Produces: `useAuth() → { user, token, isAuthed, register, login, googleLogin, resend, logout, upgrade }` — same shape as the web `AuthContextValue`, minus nothing. `AuthUser` re-exported from `lib/authApi`.

Port `sugboway-web/src/lib/authApi.ts` (its `fetch` calls work as-is) and `components/AuthProvider.tsx`, replacing `localStorage` with **`expo-secure-store`** (Android Keystore). Keys stay `sugboway-auth-token` / `sugboway-auth-user`.

- [ ] **Step 1: Install SecureStore**

```bash
npx expo install expo-secure-store
```

- [ ] **Step 2: Write the failing test**

```tsx
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import AuthProvider, { useAuth } from "../components/AuthProvider";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

function Probe() {
  const { isAuthed } = useAuth();
  return <Text>{isAuthed ? "in" : "out"}</Text>;
}

it("starts signed out when SecureStore holds no token", async () => {
  const { getByText } = render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(getByText("out")).toBeTruthy());
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- auth`
Expected: FAIL — module not found.

- [ ] **Step 4: Copy and adapt authApi**

```bash
cp sugboway-web/src/lib/authApi.ts sugboway-mobile/lib/authApi.ts
```

Then change only its first line to import the base URL from `./config`:

```ts
import { ROUTING_API_URL as BASE } from "./config";
```

- [ ] **Step 5: Implement AuthProvider**

Copy `sugboway-web/src/components/AuthProvider.tsx` and make exactly these changes:

- Delete the `"use client"` directive.
- Replace the three `localStorage` sites with `SecureStore`:

```ts
import * as SecureStore from "expo-secure-store";

// restore (async — the web version was synchronous)
useEffect(() => {
  (async () => {
    const t = await SecureStore.getItemAsync(TOKEN_KEY);
    const u = await SecureStore.getItemAsync(USER_KEY);
    if (t && u) { setToken(t); setUser(JSON.parse(u)); }
  })();
}, []);

// persist
await SecureStore.setItemAsync(TOKEN_KEY, t);
await SecureStore.setItemAsync(USER_KEY, JSON.stringify(u));

// logout
await SecureStore.deleteItemAsync(TOKEN_KEY);
await SecureStore.deleteItemAsync(USER_KEY);
```

`SecureStore` keys may not contain spaces but hyphens are fine, so `sugboway-auth-token` carries over unchanged.

- [ ] **Step 6: Run the test**

Run: `npm test -- auth`
Expected: PASS.

- [ ] **Step 7: Wrap the app**

Add `<AuthProvider>` inside `<ThemeProvider>` in `app/_layout.tsx`.

- [ ] **Step 8: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): auth provider backed by expo-secure-store"
```

---

## Task 8: Routes screen — origin/destination search

**Files:**
- Create: `sugboway-mobile/components/route/PlaceDropdown.tsx`
- Modify: `sugboway-mobile/app/(tabs)/index.tsx`
- Test: `sugboway-mobile/__tests__/route/PlaceDropdown.test.tsx`

**Interfaces:**
- Consumes: `searchPlaces`, `CEBU_PLACES`, `Place` (Task 4); `fetchNearbyStops` (Task 5); `Card`, `Icon` (Task 3)
- Produces: `<PlaceDropdown label: string; value: Place | null; onSelect: (p: Place) => void />`; the Routes screen holds `origin`/`destination` state

- [ ] **Step 1: Write the failing test**

```tsx
import { render, fireEvent } from "@testing-library/react-native";
import PlaceDropdown from "../../components/route/PlaceDropdown";

it("filters places by query and returns the chosen place", () => {
  const onSelect = jest.fn();
  const { getByPlaceholderText, getAllByTestId } = render(
    <PlaceDropdown label="From" value={null} onSelect={onSelect} />
  );
  fireEvent.changeText(getByPlaceholderText("Search a place"), "Colon");
  const results = getAllByTestId("place-option");
  expect(results.length).toBeGreaterThan(0);
  fireEvent.press(results[0]);
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ lat: expect.any(Number) }));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- PlaceDropdown`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PlaceDropdown**

The web version closes on `document.addEventListener("mousedown")`; on touch that becomes a `Modal` dismissal. `searchPlaces` already does the alias fuzzy-matching (e.g. `TC → USC Talamban`), so do not reimplement matching.

```tsx
import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { searchPlaces, type Place } from "../../data/places";

export default function PlaceDropdown({
  label, value, onSelect,
}: { label: string; value: Place | null; onSelect: (p: Place) => void }) {
  const [query, setQuery] = useState("");
  const results = query.trim() ? searchPlaces(query, 7) : [];

  return (
    <View className="gap-1">
      <Text className="text-on-surface-variant text-xs font-sans">{label}</Text>
      <TextInput
        placeholder="Search a place"
        value={query || value?.name || ""}
        onChangeText={setQuery}
        className="border border-outline-variant rounded-lg px-3 py-2 text-on-surface bg-surface-container-lowest"
      />
      {results.length > 0 && (
        <FlatList
          data={results}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(p) => p.name}
          renderItem={({ item }) => (
            <Pressable
              testID="place-option"
              onPress={() => { onSelect(item); setQuery(""); }}
              className="px-3 py-2 border-b border-outline-variant"
            >
              <Text className="text-on-surface font-sans">{item.name}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- PlaceDropdown`
Expected: PASS.

- [ ] **Step 5: Wire the Routes screen**

In `app/(tabs)/index.tsx`, hold `origin`, `destination`, `passengerType`, and `accessible` state, render two `PlaceDropdown`s and a `PrimaryButton` labeled "Find routes" that calls `searchRoutes` and stores the results. Render the result count for now.

- [ ] **Step 6: Verify on device**

Expected: typing "Colon" or "TC" surfaces Metro Cebu hubs; picking origin and destination and tapping "Find routes" logs a non-zero result count from the live API.

- [ ] **Step 7: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): place search and route search on the Routes screen"
```

---

## Task 9: Route result cards — fare, crowding, legs

**Files:**
- Create: `sugboway-mobile/components/route/RouteCard.tsx`, `RouteCodeBadge.tsx`, `FareBadge.tsx`, `CrowdingIndicator.tsx`
- Modify: `sugboway-mobile/app/(tabs)/index.tsx`
- Test: `sugboway-mobile/__tests__/route/CrowdingIndicator.test.tsx`

**Interfaces:**
- Consumes: `RouteResult`, `RouteLeg`, `classifyCrowding`, `formatPHP` (Task 4); `Card`, `Icon` (Task 3)
- Produces: `<RouteCard route: RouteResult; selected: boolean; onPress: () => void />`; `<RouteCodeBadge code: string />`; `<FareBadge farePHP: number />`; `<CrowdingIndicator score: number />`

Port from `sugboway-web/src/components/route/`. Structure changes (`div`→`View`, `span`→`Text`); NativeWind keeps the classes. Route codes use `font-mono`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render } from "@testing-library/react-native";
import CrowdingIndicator from "../../components/route/CrowdingIndicator";

it("labels an empty vehicle comfortable and a full one packed", () => {
  expect(render(<CrowdingIndicator score={0.05} />).getByText(/comfortable/i)).toBeTruthy();
  expect(render(<CrowdingIndicator score={0.98} />).getByText(/packed/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- CrowdingIndicator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement CrowdingIndicator**

Colors come from `classifyCrowding` semantics and are **reserved for crowding only**:

```tsx
import { Text, View } from "react-native";
import { classifyCrowding } from "../../domain/crowding";

const COLOR: Record<string, string> = {
  comfortable: "#1f7a43", moderate: "#c9791a", crowded: "#b8501e", packed: "#b3261e",
};

export default function CrowdingIndicator({ score }: { score: number }) {
  const { level } = classifyCrowding(score);
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLOR[level] }} />
      <Text className="text-xs font-sans capitalize text-on-surface-variant">{level}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Implement the remaining three components**

`RouteCodeBadge`:

```tsx
import { Text, View } from "react-native";

export default function RouteCodeBadge({ code }: { code: string }) {
  return (
    <View className="bg-enamel rounded px-2 py-0.5" style={{ elevation: 1 }}>
      <Text className="font-mono text-white text-sm">{code}</Text>
    </View>
  );
}
```

`FareBadge`:

```tsx
import { Text } from "react-native";
import { formatPHP } from "../../domain/fare";

export default function FareBadge({ farePHP }: { farePHP: number }) {
  return <Text className="font-mono text-on-surface text-sm">{formatPHP(farePHP)}</Text>;
}
```

`RouteCard` composes them plus per-leg rows, total time, and transfer count, wrapped in `<Card>` and made pressable for selection.

- [ ] **Step 5: Run the test**

Run: `npm test -- CrowdingIndicator`
Expected: PASS.

- [ ] **Step 6: Render results on the Routes screen**

Replace the result count with a `FlatList` of `RouteCard`s; tapping one sets `selectedRoute`.

- [ ] **Step 7: Verify on device**

Expected: a real Cebu origin/destination pair returns cards showing route codes, peso fares, and crowding dots.

- [ ] **Step 8: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): route result cards with fare and crowding"
```

---

## Task 10: The MapLibre map

**Files:**
- Create: `sugboway-mobile/components/map/RouteMap.tsx`
- Modify: `sugboway-mobile/app.config.ts`, `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `RouteResult`, `RouteLeg`, `GeoJSONFeatureCollection` (Task 4); `fetchRouteShape`, `fetchRouteStops` (Task 5); `useTheme` (Task 6)
- Produces: `<RouteMap route: RouteResult | null; styleUrl: string />`

This replaces MapLibre GL JS. The web app's "park one map element and move it between cards" trick and its `style.load` layer-restoration handler both **disappear** — RN re-renders sources declaratively.

- [ ] **Step 1: Install and register the config plugin**

```bash
npx expo install @maplibre/maplibre-react-native
```

Add to `app.config.ts` `plugins`:

```ts
plugins: ["expo-router", "@maplibre/maplibre-react-native"],
```

- [ ] **Step 2: Rebuild the development client**

A new native module means the old dev client cannot load it:

```bash
eas build --profile development --platform android
```

Install the new APK before continuing.

- [ ] **Step 3: Implement the map**

```tsx
import { MapView, Camera, ShapeSource, LineLayer, CircleLayer, MarkerView } from "@maplibre/maplibre-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { fetchRouteShape } from "../../lib/api";
import type { GeoJSONFeatureCollection, RouteResult } from "../../domain";

const EMPTY: GeoJSONFeatureCollection = { type: "FeatureCollection", features: [] };

export default function RouteMap({ route, styleUrl }: { route: RouteResult | null; styleUrl: string }) {
  const [track, setTrack] = useState<GeoJSONFeatureCollection>(EMPTY);

  useEffect(() => {
    if (!route) { setTrack(EMPTY); return; }
    let cancelled = false;
    (async () => {
      const features: GeoJSONFeatureCollection["features"] = [];
      for (const leg of route.legs) {
        const shape = leg.routeId ? await fetchRouteShape(leg.routeId) : null;
        if (shape?.features?.length) {
          features.push(...shape.features);
        } else {
          // No road geometry: draw a straight line rather than faking a path.
          features.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [leg.fromStop.location.lon, leg.fromStop.location.lat],
                [leg.toStop.location.lon, leg.toStop.location.lat],
              ],
            },
            properties: { legType: leg.type },
          });
        }
      }
      if (!cancelled) setTrack({ type: "FeatureCollection", features });
    })();
    return () => { cancelled = true; };
  }, [route]);

  const stops: GeoJSONFeatureCollection = {
    type: "FeatureCollection",
    features: (route?.legs ?? []).flatMap((leg) =>
      [leg.fromStop, leg.toStop].map((s) => ({
        type: "Feature" as const,
        geometry: { type: "Point", coordinates: [s.location.lon, s.location.lat] },
        properties: { name: s.stopName },
      })),
    ),
  };

  return (
    <MapView style={{ flex: 1 }} mapStyle={styleUrl}>
      <Camera defaultSettings={{ centerCoordinate: [123.89, 10.31], zoomLevel: 13 }} />
      <ShapeSource id="route-track" shape={track}>
        <LineLayer
          id="route-track-line"
          style={{ lineColor: "#c0392b", lineWidth: 4, lineCap: "round", lineJoin: "round" }}
        />
      </ShapeSource>
      <ShapeSource id="route-stops" shape={stops}>
        <CircleLayer
          id="route-stops-dots"
          style={{ circleRadius: 5, circleColor: "#ffffff", circleStrokeWidth: 2, circleStrokeColor: "#c0392b" }}
        />
      </ShapeSource>
      {route?.legs[0] && (
        <MarkerView coordinate={[route.legs[0].fromStop.location.lon, route.legs[0].fromStop.location.lat]}>
          <View className="bg-surface-container-lowest border border-outline-variant rounded px-2 py-1">
            <Text className="text-on-surface text-xs font-sans">{route.legs[0].fromStop.stopName}</Text>
          </View>
        </MarkerView>
      )}
    </MapView>
  );
}
```

- [ ] **Step 4: Mount it and pass the themed style**

In `app/(tabs)/index.tsx`, render `<RouteMap route={selectedRoute} styleUrl={...} />` in a fixed-height container, choosing the CARTO light or dark style from `useTheme().resolved`.

- [ ] **Step 5: Verify on device**

Expected: the basemap renders centered on Metro Cebu; selecting a route draws a vermilion track with white stop dots; switching the theme swaps the basemap without the map remounting.

- [ ] **Step 6: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): MapLibre route map with track and stop layers"
```

---

## Task 11: Fit the camera to the selected route

**Files:**
- Modify: `sugboway-mobile/components/map/RouteMap.tsx`
- Test: `sugboway-mobile/__tests__/map/bounds.test.ts`
- Create: `sugboway-mobile/lib/geo.ts`

**Interfaces:**
- Consumes: `GeoJSONFeatureCollection` (Task 4)
- Produces: `boundsOf(fc: GeoJSONFeatureCollection) → { ne: [number, number]; sw: [number, number] } | null`

Replaces `map.fitBounds(new maplibregl.LngLatBounds(...))` from `page.tsx:1027`.

- [ ] **Step 1: Write the failing test**

```ts
import { boundsOf } from "../../lib/geo";

const fc = {
  type: "FeatureCollection" as const,
  features: [{
    type: "Feature" as const,
    geometry: { type: "LineString", coordinates: [[123.85, 10.28], [123.92, 10.35]] },
  }],
};

it("computes ne/sw corners from a LineString", () => {
  expect(boundsOf(fc)).toEqual({ ne: [123.92, 10.35], sw: [123.85, 10.28] });
});

it("returns null for an empty collection", () => {
  expect(boundsOf({ type: "FeatureCollection", features: [] })).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- bounds`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { GeoJSONFeatureCollection } from "../domain";

export function boundsOf(fc: GeoJSONFeatureCollection) {
  const coords: number[][] = [];
  const walk = (c: any) => {
    if (typeof c?.[0] === "number") coords.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  fc.features.forEach((f) => walk(f.geometry?.coordinates));
  if (coords.length === 0) return null;

  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return {
    ne: [Math.max(...lons), Math.max(...lats)] as [number, number],
    sw: [Math.min(...lons), Math.min(...lats)] as [number, number],
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- bounds`
Expected: PASS, 2 tests.

- [ ] **Step 5: Drive the camera**

In `RouteMap`, compute `boundsOf(track)` and pass it to `<Camera bounds={{ ne, sw }} padding={{ paddingTop: 40, paddingBottom: 40, paddingLeft: 40, paddingRight: 40 }} animationDuration={600} />` when non-null, falling back to the default Metro Cebu camera otherwise.

- [ ] **Step 6: Verify on device**

Expected: selecting a route animates the camera to frame the whole track; switching routes reframes without a flicker.

- [ ] **Step 7: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): fit map camera to the selected route"
```

---

## Task 12: Connectivity awareness and the mock-route fallback

**Files:**
- Create: `sugboway-mobile/hooks/useConnectivity.ts`, `sugboway-mobile/data/mockRoutes.ts`
- Modify: `sugboway-mobile/app/(tabs)/index.tsx`
- Test: `sugboway-mobile/__tests__/hooks/useConnectivity.test.tsx`

**Interfaces:**
- Consumes: `RouteResult` (Task 4)
- Produces: `useConnectivity() → { isOffline: boolean }`; `MOCK_ROUTES: RouteResult[]`

Replaces `useOfflineMap`'s `navigator.onLine` + `window` `online`/`offline` events. The web app ships mock routes so it renders with the backend down; that matters more on mobile, where connectivity actually drops mid-trip.

- [ ] **Step 1: Install NetInfo**

```bash
npx expo install @react-native-community/netinfo
```

- [ ] **Step 2: Write the failing test**

```tsx
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { useConnectivity } from "../../hooks/useConnectivity";

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: (cb: (s: { isConnected: boolean }) => void) => {
    cb({ isConnected: false });
    return () => {};
  },
  fetch: () => Promise.resolve({ isConnected: false }),
}));

function Probe() {
  const { isOffline } = useConnectivity();
  return <Text>{isOffline ? "offline" : "online"}</Text>;
}

it("reports offline when NetInfo says disconnected", async () => {
  const { getByText } = render(<Probe />);
  await waitFor(() => expect(getByText("offline")).toBeTruthy());
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- useConnectivity`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the hook**

```ts
import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export function useConnectivity() {
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setIsOffline(s.isConnected === false)), []);
  return { isOffline };
}
```

- [ ] **Step 5: Port the mock routes**

Copy the mock route fixtures out of `sugboway-web/src/app/page.tsx` into `data/mockRoutes.ts`, exported as `MOCK_ROUTES: RouteResult[]`. They must satisfy the `RouteResult` type from Task 4 — if the web fixtures are inline object literals, type them explicitly so `tsc` checks them.

- [ ] **Step 6: Wire the fallback**

In the Routes screen, if `searchRoutes` throws or returns `[]` **and** the search was attempted, fall back to `MOCK_ROUTES` and show a visible "Showing sample routes — backend unreachable" banner. The banner is required: silently showing mock data as if it were live is misleading.

- [ ] **Step 7: Run the test**

Run: `npm test -- useConnectivity`
Expected: PASS.

- [ ] **Step 8: Verify on device**

Enable airplane mode, search a route. Expected: sample routes render with the banner visible; disabling airplane mode and searching again returns live data with no banner.

- [ ] **Step 9: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): NetInfo connectivity and mock-route fallback"
```

---

## Task 13: Offline map pack download

**Files:**
- Create: `sugboway-mobile/hooks/useOfflinePack.ts`, `sugboway-mobile/components/OfflineMapCard.tsx`
- Modify: `sugboway-mobile/app/(tabs)/profile.tsx`, `components/map/RouteMap.tsx`

**Interfaces:**
- Consumes: `Card`, `PrimaryButton`, `Icon` (Task 3); `useConnectivity` (Task 12)
- Produces: `useOfflinePack() → { status: "none" | "downloading" | "ready"; percent: number; download(): Promise<void>; remove(): Promise<void> }`

This **replaces the broken PMTiles stub**. `sugboway-web/public/cebu-tiles.pmtiles` is an 80-byte placeholder — the web offline basemap has never worked. Do not port it. MapLibre's `OfflineManager` downloads real tiles natively.

**Decision from spec §8.1:** a pack caches one `styleURL`. Only the **light** style is downloaded; while offline the map renders light even in dark mode. Surface that as a one-line note under the toggle.

- [ ] **Step 1: Implement the hook**

```ts
import { OfflineManager } from "@maplibre/maplibre-react-native";
import { useCallback, useEffect, useState } from "react";

const PACK_NAME = "metro-cebu";
const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const BOUNDS: [[number, number], [number, number]] = [[123.82, 10.25], [123.96, 10.42]];

export function useOfflinePack() {
  const [status, setStatus] = useState<"none" | "downloading" | "ready">("none");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    OfflineManager.getPack(PACK_NAME).then((p) => setStatus(p ? "ready" : "none")).catch(() => setStatus("none"));
  }, []);

  const download = useCallback(async () => {
    setStatus("downloading");
    setPercent(0);
    // z10-z16 over Metro Cebu exceeds the default tile cap.
    await OfflineManager.setTileCountLimit(20000);
    await OfflineManager.createPack(
      { name: PACK_NAME, styleURL: CARTO_LIGHT, minZoom: 10, maxZoom: 16, bounds: BOUNDS },
      (_pack, s) => {
        setPercent(Math.round(s.percentage ?? 0));
        if ((s.percentage ?? 0) >= 100) setStatus("ready");
      },
      () => setStatus("none"),
    );
  }, []);

  const remove = useCallback(async () => {
    await OfflineManager.deletePack(PACK_NAME);
    setStatus("none");
    setPercent(0);
  }, []);

  return { status, percent, download, remove };
}
```

- [ ] **Step 2: Build the Profile card**

`components/OfflineMapCard.tsx` renders, inside a `<Card>`:
- Title "Offline map", subtitle "Metro Cebu · zoom 10–16".
- When `status === "none"`: a `PrimaryButton` labeled "Download offline map".
- When `"downloading"`: a progress bar bound to `percent` and the percentage as text.
- When `"ready"`: a "Downloaded" row with a "Delete" `Pressable`.
- Always: the note *"Offline maps use the light basemap, even in dark mode."*

Download is **explicit and user-initiated** — never automatic, since users may be on metered data.

- [ ] **Step 3: Use the pack when offline**

In `RouteMap`, when `useConnectivity().isOffline` is true, pass the light CARTO style regardless of theme (the downloaded pack is keyed to it). If `status !== "ready"`, render an explicit "Offline — no map downloaded" overlay instead of an empty grey canvas.

- [ ] **Step 4: Verify on device**

1. Tap "Download offline map"; watch the progress bar reach 100%.
2. Enable airplane mode, restart the app, open Routes.
3. Expected: the basemap still renders. **Record this** — it is the strongest offline demo for the defense.
4. Note the measured pack size. If it is unreasonably large on a budget phone, narrow to z11–z15 or tighten the bounds to the urban core (spec §16).

- [ ] **Step 5: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): native offline map pack replacing the PMTiles stub"
```

---

## Task 14: Background location and proximity detection

**Files:**
- Create: `sugboway-mobile/tasks/locationTask.ts`, `sugboway-mobile/hooks/useProximityEtiquette.ts`, `sugboway-mobile/lib/distance.ts`
- Modify: `sugboway-mobile/app.config.ts`, `app/(tabs)/index.tsx`
- Test: `sugboway-mobile/__tests__/lib/distance.test.ts`

**Interfaces:**
- Consumes: `RouteLeg`, `GTFSStop` (Task 4); `fetchRouteStops` (Task 5)
- Produces: `haversineMeters(a: Coordinate, b: Coordinate) → number`; `useProximityEtiquette(activeLeg: RouteLeg | null) → { isNear: boolean; distanceMeters: number | null; muted: boolean; toggleMute(): void }`; task name constant `LOCATION_TASK`

This is the capability a browser genuinely cannot deliver, and the strongest technical justification for the native port.

- [ ] **Step 1: Install**

```bash
npx expo install expo-location expo-task-manager
```

- [ ] **Step 2: Declare permissions via the config plugin**

In `app.config.ts` `plugins`:

```ts
[
  "expo-location",
  {
    locationAlwaysAndWhenInUsePermission: "SugboWay uses your location to alert you before your stop, even with the screen off.",
    isAndroidBackgroundLocationEnabled: true,
    isAndroidForegroundServiceEnabled: true,
  },
],
```

- [ ] **Step 3: Write the failing distance test**

```ts
import { haversineMeters } from "../../lib/distance";

it("returns ~0 for identical points", () => {
  expect(haversineMeters({ lat: 10.3, lon: 123.9 }, { lat: 10.3, lon: 123.9 })).toBeLessThan(1);
});

it("measures a known short Cebu hop within tolerance", () => {
  // ~1.1 km of latitude at this longitude
  const d = haversineMeters({ lat: 10.3, lon: 123.9 }, { lat: 10.31, lon: 123.9 });
  expect(d).toBeGreaterThan(1000);
  expect(d).toBeLessThan(1200);
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- distance`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement haversine**

```ts
import type { Coordinate } from "../domain";

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: Coordinate, b: Coordinate): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
```

- [ ] **Step 6: Run the test**

Run: `npm test -- distance`
Expected: PASS, 2 tests.

- [ ] **Step 7: Define the background task**

`tasks/locationTask.ts` — must be imported at module scope from the root layout so it registers before use:

```ts
import * as TaskManager from "expo-task-manager";
import type { LocationObject } from "expo-location";

export const LOCATION_TASK = "sugboway-proximity";

let latest: LocationObject | null = null;
export const getLatestLocation = () => latest;

TaskManager.defineTask(LOCATION_TASK, ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: LocationObject[] };
  latest = locations[locations.length - 1] ?? latest;
});
```

- [ ] **Step 8: Port the proximity hook**

Port `sugboway-web/src/hooks/useProximityEtiquette.ts`, keeping its threshold logic and mute preference. Swap:

- `navigator.geolocation.watchPosition` → `Location.startLocationUpdatesAsync(LOCATION_TASK, { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, foregroundService: { notificationTitle: "SugboWay", notificationBody: "Watching for your stop" } })`, plus `Location.watchPositionAsync` for foreground updates.
- `navigator.geolocation.clearWatch` → `Location.stopLocationUpdatesAsync(LOCATION_TASK)`.
- `localStorage` mute → `AsyncStorage`, same key `sugboway_proximity_mute`.

Request permission **in context** — when the user starts navigating a leg, not at launch. Request foreground first, then background. If background is denied, degrade to foreground-only tracking and say so in the UI rather than failing.

- [ ] **Step 9: Verify on a real device**

Start navigating a route, lock the phone, and physically move (or use `adb` mock locations) toward the destination stop. Expected: proximity fires with the screen off, and the foreground-service notification is visible while tracking.

Test on a **budget Android phone**, not just an emulator — OEM battery managers on cheap devices kill background work aggressively, and that is exactly the hardware your users have.

- [ ] **Step 10: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): background GPS proximity detection"
```

---

## Task 15: Notifications, haptics, and the arrival chime

**Files:**
- Create: `sugboway-mobile/lib/alerts.ts`
- Modify: `sugboway-mobile/hooks/useProximityEtiquette.ts`, `app/_layout.tsx`
- Test: `sugboway-mobile/__tests__/lib/alerts.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `notifyApproachingStop(stopName: string) → Promise<void>`; `configureNotifications() → Promise<void>`

Replaces the in-page `ProximityAlert` banner, `navigator.vibrate(200)`, and the Web Audio `AudioContext` chime. These are **local** notifications scheduled on-device — no push server, no FCM credentials.

- [ ] **Step 1: Install**

```bash
npx expo install expo-notifications expo-haptics expo-audio
```

- [ ] **Step 2: Write the failing test**

```ts
import { notifyApproachingStop } from "../../lib/alerts";

const schedule = jest.fn().mockResolvedValue("id");
jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: (...a: unknown[]) => schedule(...a),
  setNotificationHandler: jest.fn(),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
}));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(), NotificationFeedbackType: { Warning: "warning" } }));

it("schedules a notification naming the stop", async () => {
  await notifyApproachingStop("Ayala Center Cebu");
  expect(schedule).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.objectContaining({ body: expect.stringContaining("Ayala Center Cebu") }),
    }),
  );
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- alerts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";

export async function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
    }),
  });
  await Notifications.requestPermissionsAsync();
}

export async function notifyApproachingStop(stopName: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Approaching your stop",
      body: `Get ready to alight at ${stopName}. Say "Lugar lang" to signal the driver.`,
      sound: true,
    },
    trigger: null, // fire immediately
  });
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}
```

The Cebuano phrase is deliberate — the web app's `NavigationInstruction.cebuanoPhrase` carries the same cultural cue, and the notification is the moment it is actually useful.

- [ ] **Step 5: Run the test**

Run: `npm test -- alerts`
Expected: PASS.

- [ ] **Step 6: Wire it up**

Call `configureNotifications()` once in `app/_layout.tsx`. In `useProximityEtiquette`, call `notifyApproachingStop(leg.toStop.stopName)` on the approach transition, guarded by the mute preference so a muted user gets neither notification nor haptic.

- [ ] **Step 7: Verify on device**

Expected: with the phone locked, approaching the destination stop produces a real system notification on the lock screen plus a vibration. Muting suppresses both.

- [ ] **Step 8: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): local notifications and haptics for stop approach"
```

---

## Task 16: Traffic tab

**Files:**
- Create: `sugboway-mobile/components/route/PeakWarning.tsx`, `sugboway-mobile/hooks/useCebuTime.ts`, `hooks/useCebuWeather.ts`
- Modify: `sugboway-mobile/app/(tabs)/traffic.tsx`

**Interfaces:**
- Consumes: `fetchCongestion`, `fetchAllRoutes`, `fetchWeather` (Task 5); `classifyCrowding` (Task 4); `Card`, `Icon` (Task 3)
- Produces: `useCebuTime() → { formattedTime: string; isPeak: boolean }`; `useCebuWeather() → { temp: number | null; condition: string; betaAdjustment: number }`; `<PeakWarning isPeak: boolean />`

Parity with the web `rush` tab. `useCebuTime` and `useCebuWeather` port nearly unchanged — one is pure date math, the other a single `fetch` to the weather proxy.

- [ ] **Step 1: Port the two hooks**

```bash
cp sugboway-web/src/hooks/useCebuTime.ts sugboway-mobile/hooks/useCebuTime.ts
cp sugboway-web/src/hooks/useCebuWeather.ts sugboway-mobile/hooks/useCebuWeather.ts
```

In `useCebuWeather.ts`, replace the `process.env.NEXT_PUBLIC_ROUTING_API_URL` constant with `import { fetchWeather } from "../lib/api"` and call that. The weather **key stays server-side** behind `GET /api/v1/weather` — never put it in the app.

- [ ] **Step 2: Build the screen**

`app/(tabs)/traffic.tsx` renders, inside `<Card>`s:
- The live Cebu time and a `<PeakWarning isPeak={isPeak} />` banner during rush hours.
- A list of routes from `fetchAllRoutes()`, each with a `<CrowdingIndicator>` fed by `fetchCongestion(routeId, isPeak, 4.0 + betaAdjustment)`.
- The weather condition, which feeds `betaAdjustment` into the BPR model exactly as on web.

Fetch congestion **lazily per visible row** (`FlatList` `onViewableItemsChanged`), not for every route at once — the web app can afford a burst of parallel requests on a desktop connection; a phone on mobile data cannot.

- [ ] **Step 3: Verify on device**

Expected: the Traffic tab lists real routes with crowding classifications, and the peak banner appears during Cebu rush hours (check by temporarily forcing `isPeak`).

- [ ] **Step 4: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): Traffic tab with congestion and peak warnings"
```

---

## Task 17: Ask SugboWay chat tab

**Files:**
- Create: `sugboway-mobile/components/chat/ChatBubble.tsx`
- Modify: `sugboway-mobile/app/(tabs)/chat.tsx`
- Test: `sugboway-mobile/__tests__/chat/rateLimit.test.ts`

**Interfaces:**
- Consumes: `askAi` (Task 5); `useAuth` (Task 7); `Card`, `Icon` (Task 3)
- Produces: `<ChatBubble sender: "user" | "ai"; text: string />`; `parseRateLimit(status: number, body: unknown) → { limited: boolean; resetSeconds: number }`

The Python service enforces the quota from the `Authorization: Bearer` header — **Free 10/hr, Pro 100/hr, Max unlimited; guest 5/hr per IP**. A 429 must be handled gracefully, not shown as a crash.

- [ ] **Step 1: Write the failing test**

```ts
import { parseRateLimit } from "../../app/(tabs)/chat";

it("detects a 429 and reads reset_seconds", () => {
  expect(parseRateLimit(429, { reset_seconds: 120 })).toEqual({ limited: true, resetSeconds: 120 });
});

it("defaults reset to one hour when the body omits it", () => {
  expect(parseRateLimit(429, {})).toEqual({ limited: true, resetSeconds: 3600 });
});

it("reports not limited on 200", () => {
  expect(parseRateLimit(200, {}).limited).toBe(false);
});
```

Export `parseRateLimit` from a small `lib/rateLimit.ts` rather than the screen file if importing a route module in Jest proves awkward; update the import accordingly.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- rateLimit`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export function parseRateLimit(status: number, body: unknown) {
  if (status !== 429) return { limited: false, resetSeconds: 0 };
  const reset = (body as { reset_seconds?: number })?.reset_seconds;
  return { limited: true, resetSeconds: typeof reset === "number" ? reset : 3600 };
}
```

- [ ] **Step 4: Build the chat screen**

`app/(tabs)/chat.tsx`:
- A `FlatList` of `<ChatBubble>`s (user bubbles use the enamel fill; AI bubbles use `surface-container`).
- A `TextInput` + send button, wrapped in `KeyboardAvoidingView` so the composer is not hidden by the Android keyboard.
- On send, call `askAi(text, token)`. On 429, disable the composer, show "You've used your hourly questions — try again in N minutes", and re-enable after the countdown.
- Keep the web app's behavior where an AI answer that names routes offers a control that jumps to the Routes tab (`router.navigate("/(tabs)")`).

The **contextual fence stays server-side** — the Python service rejects out-of-scope places before they reach Gemini. The app does no filtering of its own and must not add any.

- [ ] **Step 5: Run the test**

Run: `npm test -- rateLimit`
Expected: PASS, 3 tests.

- [ ] **Step 6: Verify on device**

Ask "How do I get from Ayala to Colon?" signed out. Expected: a real Gemini answer. Send 6 questions as a guest. Expected: the 6th is refused with a friendly countdown, not an error dump.

- [ ] **Step 7: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): Ask SugboWay chat tab with quota handling"
```

---

## Task 18: Profile tab, auth modal, and pricing

**Files:**
- Create: `sugboway-mobile/app/auth.tsx`, `sugboway-mobile/app/pricing.tsx`, `components/auth/AuthForm.tsx`, `components/ThemeToggle.tsx`
- Modify: `sugboway-mobile/app/(tabs)/profile.tsx`, `app/_layout.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 7); `useTheme` (Task 6); `OfflineMapCard` (Task 13); `Card`, `PrimaryButton`, `Icon` (Task 3)
- Produces: modal routes `/auth` and `/pricing`

- [ ] **Step 1: Register the modals**

In `app/_layout.tsx`:

```tsx
<Stack.Screen name="auth" options={{ presentation: "modal", title: "Sign in" }} />
<Stack.Screen name="pricing" options={{ presentation: "modal", title: "Plans" }} />
```

The native back gesture now dismisses them — no manual close-state to manage, unlike the web overlays.

- [ ] **Step 2: Build the auth form**

`components/auth/AuthForm.tsx` ports `AuthModal.tsx`: email/password sign-in and registration, calling `login` / `register` from `useAuth`.

Handle the three real outcomes the Go API returns:
- Registration succeeds → show "Check your email to verify your account." The verification email is sent in a **background goroutine**, so it may arrive after the response — do not block on it or imply instant delivery.
- Login with an unverified account → `needsVerification` → offer a "Resend email" action wired to `resend`.
- Invalid credentials → an inline error, never a raw status code.

- [ ] **Step 3: Build the Profile screen**

`app/(tabs)/profile.tsx` renders:
- Signed out: a "Sign in" `PrimaryButton` → `router.push("/auth")`.
- Signed in: name, email, tier badge, and a "Sign out" action.
- `<OfflineMapCard />` from Task 13.
- `<ThemeToggle />` cycling light → dark → system via `useTheme().setTheme`.
- The emergency hotline list from the web Profile tab.

- [ ] **Step 4: Build the pricing modal**

Port `PricingPlans.tsx`. `upgrade(plan)` is a **front-end demo, not payments** — label it plainly so nobody believes a real charge occurred. Free/Pro/Max quota copy must match what the Python service actually enforces (10/hr, 100/hr, unlimited).

- [ ] **Step 5: Verify on device**

Register a new account against the live backend, verify by email, sign in, confirm the tier badge, force-quit and reopen the app. Expected: the session is restored from SecureStore.

- [ ] **Step 6: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): Profile tab with auth and pricing modals"
```

---

## Task 19: Google Sign-In

**Files:**
- Create: `sugboway-mobile/components/auth/GoogleButton.tsx`
- Modify: `sugboway-mobile/app.config.ts`, `components/auth/AuthForm.tsx`

**Interfaces:**
- Consumes: `googleLogin(credential)` from `useAuth` (Task 7); `GOOGLE_WEB_CLIENT_ID` (Task 5)
- Produces: `<GoogleButton />`, hidden when `GOOGLE_WEB_CLIENT_ID` is unset

**The critical detail:** the Go API verifies the ID token's audience equals `GOOGLE_CLIENT_ID` — its **web** client ID. Android OAuth clients have a different ID, so passing an Android ID as the audience fails verification. Configuring `webClientId` makes the library mint a token with the web audience, so **`POST /api/v1/auth/google` needs no backend change**.

- [ ] **Step 1: Register an Android OAuth client**

```bash
eas credentials
```

Read the SHA-1 fingerprint of the Android keystore EAS manages. In Google Cloud Console → Credentials, create an **OAuth client ID → Android** with package name `ph.sugboway.app` and that SHA-1. Keep the existing **Web** client ID unchanged; it stays the audience.

Without this, sign-in fails **silently on device** — this is the most common failure mode in RN Google auth, and it will not reproduce in Jest.

- [ ] **Step 2: Install and configure**

```bash
npx expo install @react-native-google-signin/google-signin
```

Add `"@react-native-google-signin/google-signin"` to `app.config.ts` `plugins`, then rebuild the dev client (new native module):

```bash
eas build --profile development --platform android
```

- [ ] **Step 3: Implement the button**

```tsx
import { GoogleSignin, GoogleSigninButton, statusCodes } from "@react-native-google-signin/google-signin";
import { useEffect, useState } from "react";
import { GOOGLE_WEB_CLIENT_ID } from "../../lib/config";
import { useAuth } from "../AuthProvider";

export default function GoogleButton() {
  const { googleLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_WEB_CLIENT_ID) return;
    // webClientId => the ID token's audience is the WEB client, which is what
    // the Go API checks. Do not substitute the Android client ID here.
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  }, []);

  if (!GOOGLE_WEB_CLIENT_ID) return null; // parity with the web app hiding the button

  const onPress = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const { data } = await GoogleSignin.signIn();
      if (data?.idToken) await googleLogin(data.idToken);
    } catch (e: any) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return;
      setError("Google sign-in failed. Check your connection and try again.");
    }
  };

  return <GoogleSigninButton onPress={onPress} />;
}
```

- [ ] **Step 4: Verify on a `preview` build**

```bash
eas build --profile preview --platform android
```

Install and sign in with Google. Expected: an account is created or linked by email and the app receives the same JWT as password login.

Verify on **`preview`, not just `development`** — the two profiles can use different signing keys, and a SHA-1 registered for only one will pass in development and fail in the build you actually demo.

- [ ] **Step 5: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): Google Sign-In using the web client audience"
```

---

## Task 20: Release build

**Files:**
- Create: `sugboway-mobile/assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash.png`
- Modify: `sugboway-mobile/eas.json`, `app.config.ts`, `README.md`

**Interfaces:**
- Consumes: everything
- Produces: a signed, shareable `.apk`

- [ ] **Step 1: Configure build profiles**

`eas.json` — both `preview` and `production` must emit an **APK**, not an AAB, since there is no store listing:

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": { "ROUTING_API_URL": "https://sugboway-routing-api.onrender.com", "AI_API_URL": "https://sugboway-ai-service.onrender.com" }
    },
    "production": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": { "ROUTING_API_URL": "https://sugboway-routing-api.onrender.com", "AI_API_URL": "https://sugboway-ai-service.onrender.com" }
    }
  }
}
```

`https://sugboway-routing-api.onrender.com` is confirmed in `docs/auth-deployment-guide.md`. The AI service URL above follows the same Render naming pattern but is **not** documented anywhere in the repo — **confirm it in the Render dashboard before building**, since a wrong value is baked into the APK and only shows up as a dead chat tab.

A default AAB cannot be sideloaded, so `buildType: "apk"` is required, not optional.

- [ ] **Step 2: Add icon and splash**

Generate a 1024×1024 icon from the **`BrandMark` SVG** on an enamel `#c0392b` field. **Do not use `public/Logo.png`** — it is a 1536×1024 mockup with a baked-in backdrop that turns to mush at icon size.

```ts
icon: "./assets/icon.png",
splash: { image: "./assets/splash.png", resizeMode: "contain", backgroundColor: "#c0392b" },
android: { package: "ph.sugboway.app", adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#c0392b" } },
```

- [ ] **Step 3: Build the release APK**

```bash
eas build --profile production --platform android
```

**Do not leave this until defense week** — EAS free-tier queues lengthen under load. A shippable APK should already exist from Task 13.

- [ ] **Step 4: Full manual regression on a real device**

Install the production APK on a clean phone and confirm each of:

- [ ] All four tabs open and switch.
- [ ] A real Cebu route search returns live results with fares and crowding.
- [ ] The map draws the route track and stop dots, and frames the route.
- [ ] Light/dark toggle swaps both app chrome and basemap.
- [ ] Offline map downloads; airplane mode still renders the basemap.
- [ ] Airplane mode search shows sample routes **with** the fallback banner.
- [ ] Proximity alert fires with the screen locked.
- [ ] Chat answers, and a guest is cut off at 6 questions with a countdown.
- [ ] Register → verify by email → sign in works.
- [ ] Google Sign-In works.
- [ ] Session survives a force-quit.

- [ ] **Step 5: Document the install**

Add to `sugboway-mobile/README.md`: the APK download link, "allow install from unknown sources" instructions, the backend URLs the build points at, and the note that changing a backend URL requires a rebuild.

- [ ] **Step 6: Commit**

```bash
git add sugboway-mobile
git commit -m "feat(mobile): release build config, icon, splash, and install docs"
```

---

## Plan Self-Review

**Spec coverage** — every section maps to at least one task:

| Spec section | Task(s) |
|---|---|
| §2 Decisions (Expo, Android, EAS, NativeWind, MapLibre, copy domain) | 1, 2, 4, 10, 20 |
| §3 Portability audit | 4 (copies), 6/7/12/14/15 (browser-API swaps), 10 (map rewrite), 19 (Google rewrite) |
| §4 Architecture / ports contract | 4, 5 |
| §5 Project layout | 1, and each task's Files block |
| §6 Screens & navigation | 1, 8, 16, 17, 18 |
| §7 The map | 10, 11 |
| §8.1 Offline packs | 13 |
| §8.2 Background GPS | 14 |
| §8.3 Notifications | 15 |
| §8.4 Secure token storage | 7 |
| §9 Auth + Google `webClientId` | 7, 18, 19 |
| §10 Config & endpoints | 5 |
| §11 Offline & resilience | 12, 13 |
| §12 Styling, `.sw-*`, Material Symbols | 2, 3 |
| §13 Build & distribution | 1 (dev build), 20 |
| §14 Testing | 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 17 (unit); 20 (manual regression) |
| §15 Sequencing | Task order 1→20 |
| §16 Risks | 2 (NativeWind fallback), 13 (pack size), 14 (OEM battery), 19 (SHA-1), 20 (queue) |
| §17 Out of scope | Global Constraints |

No gaps found.

**Type consistency checked across tasks:**
- `Coordinate { lat, lon }` — used identically in Tasks 5, 11, 14.
- `GTFSStop.location` is a `Coordinate` (not flat `lat`/`lon` on the stop) — Tasks 10 and 14 both use `stop.location.lon`.
- `boundsOf` returns `{ ne, sw }` in Task 11 and is consumed as `{ ne, sw }` in the same task's Step 5.
- `useOfflinePack().status` uses the same three literals `"none" | "downloading" | "ready"` in Tasks 13 Steps 1, 2, and 3.
- `askAi` returns `{ ok, status, body }` in Task 5 and is destructured that way in Task 17.
- Storage keys match the web app throughout: `sugboway-theme`, `sugboway-auth-token`, `sugboway-auth-user`, `sugboway_proximity_mute`.

**Known deviation from strict TDD:** Tasks 1, 2, 10, 13, 16, 18, and 20 have no unit test step. These are native-module integration and visual layout, where a Jest assertion would test the mock rather than the behavior — they carry explicit on-device verification steps instead. Every task with real logic (fare, crowding, bounds, distance, rate limits, connectivity, auth state, API error handling) is test-first.

**Dev-client rebuild points** — a JS reload is not enough after Tasks 2, 10, 14, 15, and 19, since each adds native code. Each says so in place.

