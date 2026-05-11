import ImageSheet from "@/components/image-picker-sheet";
import { ToastProvider } from "@/context/toast-context";
import { initializeDatabase } from "@/db/initialize";
import { useSecureStorage } from "@/hooks/use-securestore";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import Ionicons from "@expo/vector-icons/Ionicons";
import { setAudioModeAsync } from "expo-audio";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";

// Keep the splash visible until the destination home screen (or auth layout)
// explicitly hides it. Eliminates the blank-header gap between splash and home.
SplashScreen.preventAutoHideAsync().catch(() => { /* already hidden */ });
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { LogBox, Platform, Text, View } from "react-native";
import { registerSheet, SheetProvider } from "react-native-actions-sheet";

// Cap system font scaling globally so fixed-height layouts don't break
(Text as any).defaultProps = { ...((Text as any).defaultProps ?? {}), maxFontSizeMultiplier: 1.3 };

// Suppress expo-notifications warnings that only apply in Expo Go on Android.
LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications",
  "expo-notifications functionality",
  "`expo-notifications` functionality",
]);
import "../global.css";
import "../i18n";

registerSheet("image-picker-sheet", ImageSheet);

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export default function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const { initialize, getValue } = useSecureStorage();
  const [isReady, setIsReady] = useState(false);

  // Preload icon fonts so they're guaranteed registered before any icon renders.
  // Without this, lazy font loading inside @expo/vector-icons can fail offline.
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...Feather.font,
    ...FontAwesome.font,
    ...FontAwesome6.font,
  });

  // Make in-app sound previews (notification sound picker) play even when the
  // phone is in silent mode. iOS notifications already bypass silent via the
  // notification system, but expo-audio's playback respects the silent switch
  // by default — leaving the preview silent for users who keep their phone
  // muted. This flips that.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch((e) =>
      console.warn("setAudioModeAsync failed", e),
    );
  }, []);

  useEffect(() => {
    const setup = async () => {
      const savedScheme = await getValue("colorScheme");
      if (!savedScheme) {
        await initialize({ colorScheme: "light", language: "en" });
        setColorScheme("light");
      } else {
        setColorScheme(savedScheme as "light" | "dark");
      }
      setIsReady(true);
    };
    setup();
  }, []);

  // Safety net: if something stalls the destination screens for > 4s, hide
  // the splash anyway so the user sees the app instead of a frozen icon.
  // Normally the home / auth layouts hide the splash on mount themselves.
  useEffect(() => {
    const id = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => { /* already hidden */ });
    }, 4000);
    return () => clearTimeout(id);
  }, []);

  if (!isReady || !fontsLoaded) return null;

  // Note: intentionally no <ClerkLoaded> wrapper. ClerkLoaded blocks rendering
  // on a network-dependent load; offline launches with a cached session would
  // hang forever. (app)/_layout and (auth)/_layout gate on useAuth().isLoaded
  // themselves, which resolves from tokenCache without network.
  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
        <View className={`flex-1 ${colorScheme === "dark" ? "dark" : "light"}`}>
          {/* Default matches bg-background; AppHeader overrides for bg-primary contexts. */}
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
          <SheetProvider>
            <ToastProvider>
              <SQLiteProvider databaseName="myDatabase.db" onInit={initializeDatabase}>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    animation: Platform.OS === "android" ? "simple_push" : "ios_from_right",
                    animationDuration: 250,
                    contentStyle: {
                      backgroundColor: colorScheme === "dark" ? "#0a1410" : "#f2fbf5",
                    },
                  }}
                />
              </SQLiteProvider>
            </ToastProvider>
          </SheetProvider>
        </View>
    </ClerkProvider>
  );
}
