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
