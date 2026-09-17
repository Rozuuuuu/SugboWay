# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# SugboWay Mobile — conventions that will bite you

This is the React Native (Expo SDK 57) port of `../sugboway-web`. The backends
(`../sugboway-routing-api`, `../sugboway-ai-service`) and the web app are **not** modified by
this project — read from the web app, never write to it.

Design and plan documents:
`../docs/superpowers/specs/2026-09-09-react-native-mobile-design.md`,
`../docs/superpowers/plans/2026-09-09-react-native-mobile.md`.

## Installing anything: verify it actually landed

`npm install` here needs `--legacy-peer-deps`, because of a pre-existing conflict in
`expo-router`'s web-only optional dependencies (`@expo/dom-webview` / `@radix-ui` / `vaul`
pull `react-dom@19.2.8` against a pinned `react@19.2.3`).

**That flag disables automatic peer installation, and it has silently dropped six required
packages so far** — `react-native-worklets`, `babel-preset-expo`, `@react-native/jest-preset`,
`test-renderer`, `expo-asset`, and one inert case. Three of them would have broken the build
or the app with errors that point nowhere near the real cause. `expo-asset` in particular was
missing until Task 8, and without it **any component that mounts an `Icon` fails** — which is
most screens.

This keeps happening. Assume the next install drops something too.

So, every time you install:

1. Use `npx expo install <pkg>` for anything with native code or an Expo-managed version.
2. Afterwards, confirm the package exists in **both** `package-lock.json` and `node_modules/`,
   and that its own declared peers are present.
3. A zero exit code is not evidence the install worked.

## Testing: React Native Testing Library is pinned to v13 on purpose

`@testing-library/react-native` is held at `^13.3.3`. **Do not bump it to v14.**

v14 made `render()` asynchronous. Every test in this project uses the synchronous form:

```tsx
const { getByText } = render(<PrimaryButton label="Find routes" onPress={onPress} />);
```

Upgrading to v14 breaks every existing test at once, and `await render(...)` in a new test
will not match the surrounding style. If v14 is ever genuinely wanted, it is a single
deliberate change that bumps the dependency and rewrites all tests in one pass — not
something to do in passing while implementing a feature.

Run tests with `npm test` from this directory.

### Testing a screen that renders an `Icon`

`jest-expo` stubs font assets to the number `1`, so the icon font never really loads and
`@expo/vector-icons` rejects. In a synchronous test this is invisible, but any test that
awaits (a screen test with async state, for instance) will surface it as an unhandled
rejection or a failure that looks unrelated to what you are testing.

Mock the wrapper locally in those test files:

```tsx
jest.mock("../../components/ui/Icon", () => "Icon");
```

Mock `components/ui/Icon`, not `@expo/vector-icons` — the wrapper is ours and the seam is
cleaner.

## Icons: web icon names do NOT copy over

The web app uses the **Material Symbols Outlined** web font via
`className="material-symbols-outlined"`, with underscore names like `wb_sunny`.

This app uses `@expo/vector-icons/MaterialIcons`, which wraps the **classic Material Icons**
font, with hyphen names like `wb-sunny`. They are different icon sets:

- Multi-word names differ in separator: `wb_sunny` → `wb-sunny`.
- Some Symbols names have **no classic equivalent at all** — `rainy` (used in the web app's
  weather chip) does not exist in the classic set and needs a substitute such as `grain`
  or `water-drop`.

So when porting a screen, **translate each icon name and verify it exists** in
`MaterialIcons.glyphMap`. Do not copy the web string and assume it renders — an unknown name
renders as blank space, not an error.

## Styling

- Style through NativeWind classes (`bg-surface`, `text-on-surface`, `border-outline-variant`),
  not literal hex. The exception is a `style` prop where a class genuinely cannot reach — for
  example `react-native-svg` `fill`/`stroke`, or MapLibre layer styles, which are native props.
  In those cases read `theme/tokens.ts`, do not hardcode.
- **Never write `dark:` prefixes.** Dark mode resolves through CSS variables that a root `dark`
  class overrides (see `global.css`). Bare `bg-surface` is already theme-reactive.
- **Two accents, distinct roles — do not conflate them.** `cebu-blue` is the text/stroke accent
  (`#c0392b` light, brightened to `#ff6a57` dark for legibility). `enamel` is the plate fill
  that sits behind white text (`#d23a2b` light, `#da3e2e` dark).
- Green / amber / clay / red are **reserved for crowding indicators**. Never reuse them for
  generic UI state. Their hex values shift between themes, so always read them from
  `TOKENS[resolved]`.
- `box-shadow` has no RN equivalent — use Android `elevation`. Hover states have no touch
  equivalent — make them pressed states.
- The design tokens' source of truth is `../sugboway-web/src/app/globals.css`. Its dark values
  live in the `@layer theme { html.dark, .dark { … } }` block near the top, **not** the
  `.sw-*` block further down, which only redefines the enamel plate variables. Read the file;
  do not infer a dark value by darkening a light one.

## Copied domain code

`domain/` and `data/places.ts` are byte-for-byte copies of `sugboway-web/src/{domain,data}`,
not shared via an npm workspace (Metro resolves symlinked workspaces badly). Do not edit
these copied files to "fix" a test or add a feature — they are the shipping, production
LTFRB fare table and BPR crowding model. If the fare/crowding logic genuinely needs to
change, edit `sugboway-web/src/domain/` first and re-copy both files in the same commit.
See the "Copied code" section in `README.md` for the drift-warning this rule backs.

## Known sharp edges

- `<Card>` sets its own `className` and `style` *after* spreading `...rest`, so a `style` prop
  passed by a caller is silently ignored. Wrap it instead of fighting it.
- `BrandMark`'s colors are fixed hex, not theme-reactive — faithful to the web component, which
  behaves the same way. On the enamel plate, pass `mono` or the mark renders
  enamel-on-enamel and nearly disappears.
- `app/_layout.tsx` gates rendering on `useFonts` and ignores the hook's error value, so a font
  load failure would render nothing, forever, with no console signal.
- `AuthProvider`'s `logout()` returns a `Promise<void>` (unlike web's synchronous version,
  because `SecureStore` is async) — **always `await logout()`** before navigating away from a
  screen that calls it. Firing it and navigating immediately reopens the window where a
  process death before the SecureStore deletes land leaves the token on disk, and the next
  launch's restore silently signs the user back in.
