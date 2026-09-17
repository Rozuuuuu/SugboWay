import { render, fireEvent } from "@testing-library/react-native";
import PlaceDropdown from "../../components/route/PlaceDropdown";

describe("PlaceDropdown", () => {
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

  // Weak assertions ("something was called") have let real bugs through this
  // plan before — pin the exact Place, coordinates included, not just a shape.
  it("passes the actual matched Place object, including its real coordinates", () => {
    const onSelect = jest.fn();
    const { getByPlaceholderText, getAllByTestId } = render(
      <PlaceDropdown label="From" value={null} onSelect={onSelect} />
    );
    fireEvent.changeText(getByPlaceholderText("Search a place"), "Colon");
    fireEvent.press(getAllByTestId("place-option")[0]);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "colon",
        name: "Colon Street (Metro)",
        lat: 10.297,
        lon: 123.899,
      })
    );
  });

  // searchPlaces already does alias fuzzy-matching ("TC" -> USC Talamban) —
  // this pins that PlaceDropdown actually calls it rather than doing a naive
  // substring match of its own.
  it("surfaces a place via its alias, not just its canonical name", () => {
    const onSelect = jest.fn();
    const { getByPlaceholderText, getAllByTestId } = render(
      <PlaceDropdown label="To" value={null} onSelect={onSelect} />
    );
    fireEvent.changeText(getByPlaceholderText("Search a place"), "TC");
    const results = getAllByTestId("place-option");
    expect(results.length).toBeGreaterThan(0);
    fireEvent.press(results[0]);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: "USC Talamban" })
    );
  });

  it("shows no results for an empty query", () => {
    const onSelect = jest.fn();
    const { queryAllByTestId } = render(
      <PlaceDropdown label="From" value={null} onSelect={onSelect} />
    );
    expect(queryAllByTestId("place-option")).toHaveLength(0);
  });

  it("displays the selected value's name in the field when not actively editing", () => {
    const place = { id: "colon", name: "Colon Street (Metro)", lat: 10.297, lon: 123.899, category: "Downtown" as const, aliases: [] };
    const { getByDisplayValue } = render(
      <PlaceDropdown label="From" value={place} onSelect={jest.fn()} />
    );
    expect(getByDisplayValue("Colon Street (Metro)")).toBeTruthy();
  });
});
