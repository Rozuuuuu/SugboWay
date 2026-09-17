import { useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { searchPlaces, type Place } from "../../data/places";
import Icon from "../ui/Icon";

/**
 * Typeahead over Cebu's primary hubs (`data/places.ts` — CEBU_PLACES),
 * ported from sugboway-web's PlaceDropdown.
 *
 * The web version closes its suggestion list on
 * `document.addEventListener("mousedown")`, which has no RN equivalent.
 * Here the results render inside a transparent `Modal`; a full-screen
 * backdrop `Pressable` behind the list dismisses it on an outside tap, and
 * Android's back button closes it via `onRequestClose`.
 *
 * Matching is entirely `searchPlaces`'s job (including alias fuzzy-matching,
 * e.g. "TC" -> USC Talamban) — this component never re-implements it.
 */
export default function PlaceDropdown({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: Place | null;
  onSelect: (p: Place) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const results = query.trim() ? searchPlaces(query, 7) : [];
  const showResults = open && results.length > 0;

  const close = () => setOpen(false);

  const handleSelect = (place: Place) => {
    onSelect(place);
    setQuery("");
    close();
  };

  return (
    <View className="gap-1">
      <Text className="text-on-surface-variant text-xs font-sans">{label}</Text>
      <TextInput
        placeholder="Search a place"
        value={query || value?.name || ""}
        onChangeText={(text) => {
          setQuery(text);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="border border-outline-variant rounded-lg px-3 py-2 text-on-surface bg-surface-container-lowest"
      />

      <Modal visible={showResults} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          testID="place-dropdown-backdrop"
          className="flex-1 bg-black/30 justify-start pt-32 px-4"
          onPress={close}
        >
          <View className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden max-h-72">
            <FlatList
              data={results}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <Pressable
                  testID="place-option"
                  onPress={() => handleSelect(item)}
                  className="flex-row items-center gap-2 px-3 py-2 border-b border-outline-variant active:bg-surface-container"
                >
                  <Icon name="place" size={16} />
                  <Text className="text-on-surface font-sans">{item.name}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
