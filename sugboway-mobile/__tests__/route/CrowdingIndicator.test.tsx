import { render } from "@testing-library/react-native";
import CrowdingIndicator from "../../components/route/CrowdingIndicator";

const mockUseTheme = jest.fn();
jest.mock("../../components/ThemeProvider", () => ({
  useTheme: () => mockUseTheme(),
}));

describe("CrowdingIndicator", () => {
  beforeEach(() => {
    mockUseTheme.mockReturnValue({ theme: "light", resolved: "light", setTheme: jest.fn() });
  });

  it("labels an empty vehicle comfortable and a full one packed", () => {
    expect(render(<CrowdingIndicator score={0.05} />).getByText(/comfortable/i)).toBeTruthy();
    expect(render(<CrowdingIndicator score={0.98} />).getByText(/packed/i)).toBeTruthy();
  });

  // Correction 1's whole point: the crowding palette is NOT theme-invariant
  // (`safe-green` is `#1f7a43` light, `#4fc27a` dark). The dot's color comes
  // from a `style` prop a Tailwind class can't reach, so a hardcoded value
  // would pass a label-only test while being nearly invisible on a dark
  // surface. Pin the actual hex on both themes, not just that they differ.
  it("changes the crowding dot's background color between light and dark themes", () => {
    mockUseTheme.mockReturnValue({ theme: "light", resolved: "light", setTheme: jest.fn() });
    const light = render(<CrowdingIndicator score={0.05} />).getByTestId("crowding-dot");
    expect(light.props.style.backgroundColor).toBe("#1f7a43");

    mockUseTheme.mockReturnValue({ theme: "dark", resolved: "dark", setTheme: jest.fn() });
    const dark = render(<CrowdingIndicator score={0.05} />).getByTestId("crowding-dot");
    expect(dark.props.style.backgroundColor).toBe("#4fc27a");

    expect(dark.props.style.backgroundColor).not.toBe(light.props.style.backgroundColor);
  });

  it("also shifts color at the packed (error) level between themes", () => {
    mockUseTheme.mockReturnValue({ theme: "light", resolved: "light", setTheme: jest.fn() });
    const light = render(<CrowdingIndicator score={0.98} />).getByTestId("crowding-dot");
    expect(light.props.style.backgroundColor).toBe("#b3261e");

    mockUseTheme.mockReturnValue({ theme: "dark", resolved: "dark", setTheme: jest.fn() });
    const dark = render(<CrowdingIndicator score={0.98} />).getByTestId("crowding-dot");
    expect(dark.props.style.backgroundColor).toBe("#ffb4ab");
  });
});
