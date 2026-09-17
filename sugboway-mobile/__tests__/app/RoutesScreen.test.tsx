import { render, fireEvent } from "@testing-library/react-native";
import RoutesScreen from "../../app/(tabs)/index";
import * as api from "../../lib/api";
import type { GTFSStop, RouteResult } from "../../domain";

// RouteCard now pulls in CrowdingIndicator -> ThemeProvider -> AsyncStorage.
// Jest has no native AsyncStorage module linked, so without this mock the
// import chain throws "NativeModule: AsyncStorage is null" (see
// __tests__/theme.test.tsx, which needs the same mock for the same reason).
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// The routing DB autosuspends and a real search can take ~30s to answer.
// Never let a test touch the live backend — mock searchRoutes outright.
jest.mock("../../lib/api", () => ({
  searchRoutes: jest.fn(),
}));

// RouteMap pulls in @maplibre/maplibre-react-native, a native module shipped
// as ESM that Jest cannot require() — and even if it could, the map can't be
// meaningfully exercised outside a device (see components/map/RouteMap.tsx).
// This screen's tests are about search/selection wiring, not the map itself,
// so stub the component the same way Icon is stubbed below.
jest.mock("../../components/map/RouteMap", () => "RouteMap");

// @expo/vector-icons's componentDidMount calls expo-font's loadAsync, which
// resolves the icon font file through expo-asset's module registry. Under
// Jest, jest-expo's asset transform stubs every asset file to the bare
// number `1` (see node_modules/jest-expo/src/preset/assetFileTransformer.js)
// instead of a real registered asset, so that lookup always rejects. It
// never surfaces in a synchronous render() (the rejection lands after the
// test already finished), but any test that awaits — findBy*, waitFor —
// gives the microtask time to run and the test fails on an error that has
// nothing to do with the screen under test. Stub the icon out here instead.
jest.mock("../../components/ui/Icon", () => "Icon");

const selectPlace = (
  getByPlaceholderText: ReturnType<typeof render>["getByPlaceholderText"],
  getAllByTestId: ReturnType<typeof render>["getAllByTestId"],
  label: string,
  query: string
) => {
  const inputs = getByPlaceholderText("Search a place");
  fireEvent.changeText(inputs, query);
  fireEvent.press(getAllByTestId("place-option")[0]);
};

function stop(stopName: string): GTFSStop {
  return {
    stopId: stopName.toLowerCase().replace(/\s+/g, "-"),
    stopName,
    aliases: [],
    location: { lat: 10.3, lon: 123.9 },
    routeIds: ["13C"],
    wheelchairAccessible: false,
    hasShelter: false,
    isTerminal: false,
  };
}

// A route with real shape: one transit leg + one walking leg, so the card
// under test actually exercises fare calc, crowding, and per-leg rendering
// instead of the placeholder `{}` doubles the old count-only test used.
function makeRoute(overrides: Partial<RouteResult> = {}): RouteResult {
  return {
    legs: [
      {
        type: "transit",
        routeId: "13C",
        routeShortName: "13C",
        route: {
          routeId: "13C",
          routeShortName: "13C",
          routeLongName: "Talamban - Colon via Ramos",
          routeType: "jeepney",
          agencyId: "agency-1",
          isModernized: false,
          hasAircon: false,
        },
        fromStop: stop("Colon Street"),
        toStop: stop("USC Talamban"),
        durationSeconds: 900,
        distanceMeters: 6000,
        farePHP: 13,
        instructions: [],
      },
      {
        type: "walking",
        fromStop: stop("USC Talamban"),
        toStop: stop("USC Talamban Gate"),
        durationSeconds: 120,
        distanceMeters: 150,
        instructions: [],
      },
    ],
    totalTimeSeconds: 1020,
    totalFarePHP: 13,
    transfers: 0,
    crowdingWorstLeg: 0.2,
    geoJson: { type: "FeatureCollection", features: [] },
    ...overrides,
  };
}

describe("RoutesScreen", () => {
  afterEach(() => jest.resetAllMocks());

  it("disables Find routes until both an origin and destination are chosen", () => {
    const { getByRole, getAllByPlaceholderText, getAllByTestId } = render(<RoutesScreen />);
    expect(getByRole("button", { name: "Find routes" }).props.accessibilityState?.disabled).toBe(true);

    const [fromInput] = getAllByPlaceholderText("Search a place");
    fireEvent.changeText(fromInput, "Colon");
    fireEvent.press(getAllByTestId("place-option")[0]);
    // Only origin chosen — destination still empty, button must stay disabled.
    expect(getByRole("button", { name: "Find routes" }).props.accessibilityState?.disabled).toBe(true);
  });

  it("calls searchRoutes with the two chosen places' real coordinates and renders a route card per result", async () => {
    (api.searchRoutes as jest.Mock).mockResolvedValue([makeRoute(), makeRoute(), makeRoute()]);
    const { getByText, getAllByPlaceholderText, getAllByTestId, findAllByTestId } = render(
      <RoutesScreen />
    );

    const [fromInput, toInput] = getAllByPlaceholderText("Search a place");
    fireEvent.changeText(fromInput, "Colon");
    fireEvent.press(getAllByTestId("place-option")[0]);
    fireEvent.changeText(toInput, "TC");
    fireEvent.press(getAllByTestId("place-option")[0]);

    fireEvent.press(getByText("Find routes"));

    expect(api.searchRoutes).toHaveBeenCalledWith(
      { lat: 10.297, lon: 123.899 }, // Colon Street (Metro)
      { lat: 10.352, lon: 123.912 }, // USC Talamban
      "regular",
      false
    );

    const cards = await findAllByTestId("route-card");
    expect(cards).toHaveLength(3);
  });

  it("shows the route's fare, code, and crowding label on its card", async () => {
    (api.searchRoutes as jest.Mock).mockResolvedValue([makeRoute()]);
    const { getByText, getAllByPlaceholderText, getAllByTestId, findAllByTestId } = render(
      <RoutesScreen />
    );

    const [fromInput, toInput] = getAllByPlaceholderText("Search a place");
    fireEvent.changeText(fromInput, "Colon");
    fireEvent.press(getAllByTestId("place-option")[0]);
    fireEvent.changeText(toInput, "TC");
    fireEvent.press(getAllByTestId("place-option")[0]);
    fireEvent.press(getByText("Find routes"));
    await findAllByTestId("route-card");

    // RouteCard sums every leg's distance (transit 6000m + walking 150m =
    // 6.15km), regular passenger, 0 transfers:
    // base 13.00 + (6.15-4)*1.80 = 16.87, no discount -> totalFare 16.87.
    expect(getByText("₱16.87")).toBeTruthy();
    expect(getByText("13C")).toBeTruthy();
    expect(getByText(/comfortable/i)).toBeTruthy();
  });

  it("sets the tapped route as selected", async () => {
    const routeA = makeRoute();
    const routeB = makeRoute({ totalTimeSeconds: 1500 });
    (api.searchRoutes as jest.Mock).mockResolvedValue([routeA, routeB]);
    const { getByText, getAllByPlaceholderText, getAllByTestId, findAllByTestId } = render(
      <RoutesScreen />
    );

    const [fromInput, toInput] = getAllByPlaceholderText("Search a place");
    fireEvent.changeText(fromInput, "Colon");
    fireEvent.press(getAllByTestId("place-option")[0]);
    fireEvent.changeText(toInput, "TC");
    fireEvent.press(getAllByTestId("place-option")[0]);
    fireEvent.press(getByText("Find routes"));

    let cards = await findAllByTestId("route-card");
    // Neither card is selected before anything is tapped.
    expect(cards[0].props.accessibilityState?.selected).toBeFalsy();
    expect(cards[1].props.accessibilityState?.selected).toBeFalsy();

    fireEvent.press(cards[1]);

    // RouteCard's Pressable sets accessibilityState={{ selected }}, so this
    // asserts the tap actually flowed through to `selectedRoute` state
    // (not just that pressing doesn't crash) — a screen reader needs this
    // to announce which route is selected, too.
    cards = await findAllByTestId("route-card");
    expect(cards[0].props.accessibilityState?.selected).toBeFalsy();
    expect(cards[1].props.accessibilityState?.selected).toBe(true);
  });

  it("shows an error instead of crashing when the routing service rejects", async () => {
    (api.searchRoutes as jest.Mock).mockRejectedValue(new Error("502"));
    const { getByText, getAllByPlaceholderText, getAllByTestId, findByText } = render(
      <RoutesScreen />
    );

    const [fromInput, toInput] = getAllByPlaceholderText("Search a place");
    fireEvent.changeText(fromInput, "Colon");
    fireEvent.press(getAllByTestId("place-option")[0]);
    fireEvent.changeText(toInput, "TC");
    fireEvent.press(getAllByTestId("place-option")[0]);

    fireEvent.press(getByText("Find routes"));

    await findByText(/Couldn't reach the routing service/);
    expect(api.searchRoutes).toHaveBeenCalledTimes(1);
  });

  it("shows an empty-state message when the search legitimately returns no routes", async () => {
    (api.searchRoutes as jest.Mock).mockResolvedValue([]);
    const { getByText, getAllByPlaceholderText, getAllByTestId, findByTestId } = render(
      <RoutesScreen />
    );

    const [fromInput, toInput] = getAllByPlaceholderText("Search a place");
    fireEvent.changeText(fromInput, "Colon");
    fireEvent.press(getAllByTestId("place-option")[0]);
    fireEvent.changeText(toInput, "TC");
    fireEvent.press(getAllByTestId("place-option")[0]);

    fireEvent.press(getByText("Find routes"));

    await findByTestId("route-empty");
  });
});
