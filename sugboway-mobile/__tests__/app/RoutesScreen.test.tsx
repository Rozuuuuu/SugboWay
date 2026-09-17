import { render, fireEvent } from "@testing-library/react-native";
import RoutesScreen from "../../app/(tabs)/index";
import * as api from "../../lib/api";

// The routing DB autosuspends and a real search can take ~30s to answer.
// Never let a test touch the live backend — mock searchRoutes outright.
jest.mock("../../lib/api", () => ({
  searchRoutes: jest.fn(),
}));

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

  it("calls searchRoutes with the two chosen places' real coordinates and renders the result count", async () => {
    (api.searchRoutes as jest.Mock).mockResolvedValue([{}, {}, {}]);
    const { getByText, getAllByPlaceholderText, getAllByTestId, findByTestId } = render(
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

    const count = await findByTestId("route-result-count");
    expect(count.props.children.join("")).toContain("3");
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
});
