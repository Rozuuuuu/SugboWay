import "../global.css";
import { Stack } from "expo-router";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, HankenGrotesk_400Regular, HankenGrotesk_600SemiBold } from "@expo-google-fonts/hanken-grotesk";
import { SairaCondensed_600SemiBold } from "@expo-google-fonts/saira-condensed";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import ThemeProvider, { useTheme } from "../components/ThemeProvider";
import AuthProvider from "../components/AuthProvider";

function ThemedRoot() {
  const { resolved } = useTheme();

  return (
    <View className={resolved === "dark" ? "dark flex-1" : "flex-1"}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </SafeAreaProvider>
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
    SairaCondensed_600SemiBold,
    JetBrainsMono_500Medium,
  });

  if (error) {
    console.error("Font loading failed, rendering with system fallback fonts:", error);
  }

  if (!loaded && !error) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <ThemedRoot />
      </AuthProvider>
    </ThemeProvider>
  );
}
