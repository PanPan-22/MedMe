import ImageSheet from "@/components/image-picker-sheet";
import { ToastProvider } from "@/context/toast-context";
import { initializeDatabase } from "@/db/initialize";
import { useSecureStorage } from "@/hooks/use-securestore";
import { ClerkLoaded, ClerkProvider } from "@clerk/expo";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
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

  if (!isReady) return null;

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkLoaded>
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
      </ClerkLoaded>
    </ClerkProvider>
  );
}
