import ImageSheet from "@/components/image-picker-sheet";
import { ToastProvider } from "@/context/toast-context";
import { initializeDatabase } from "@/db/initialize";
import { useSecureStorage } from "@/hooks/use-securestore";
import { ClerkLoaded, ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/secure-store";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { registerSheet, SheetProvider } from "react-native-actions-sheet";
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
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <View className={`flex-1 ${colorScheme === "dark" ? "dark" : "light"}`}>
          <StatusBar style={colorScheme === "dark" ? "dark" : "light"} />
          <SheetProvider>
            <ToastProvider>
              <SQLiteProvider databaseName="myDatabase.db" onInit={initializeDatabase}>
                <Stack screenOptions={{ headerShown: false }} />
              </SQLiteProvider>
            </ToastProvider>
          </SheetProvider>
        </View>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
