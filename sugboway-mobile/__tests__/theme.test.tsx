import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ThemeProvider, { useTheme } from "../components/ThemeProvider";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

function Probe() {
  const { resolved, setTheme } = useTheme();
  return (
    <>
      <Text>{resolved}</Text>
      <Text onPress={() => setTheme("dark")}>activate</Text>
    </>
  );
}

it("resolves to a concrete light or dark value", async () => {
  const { getByText } = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
  await waitFor(() => expect(getByText(/light|dark/)).toBeTruthy());
});

it("setTheme('dark') updates resolved and persists the choice under the sugboway-theme key", async () => {
  const { getByText } = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );

  await act(async () => {
    fireEvent.press(getByText("activate"));
  });

  await waitFor(() => expect(getByText("dark")).toBeTruthy());
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith("sugboway-theme", "dark"));
});
