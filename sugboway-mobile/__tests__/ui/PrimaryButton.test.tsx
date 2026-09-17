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
