import { ToastProvider } from "@/context/toast-context";
import { initializeDatabase } from "@/db/initialize";
import { useSecureStorage } from "@/hooks/use-securestore";
import Feather from "@expo/vector-icons/Feather";
import { Link, Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar"; // Import from here
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import "../global.css";

export default function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const { initialize, getValue } = useSecureStorage();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const setup = async () => {
      // 1. Fetch current saved value FIRST
      const savedScheme = await getValue("colorScheme");

      if (!savedScheme) {
        // 2. If nothing exists, only THEN initialize defaults
        await initialize({
          colorScheme: "light",
          language: "en",
        });
        setColorScheme("light");
      } else {
        // 3. If it exists, apply it
        setColorScheme(savedScheme as "light" | "dark");
      }

      setIsReady(true);
    };

    setup();
  }, []);

  if (!isReady) return null;

  return (
    // Explicitly check for 'dark' and provide 'light' as fallback class
    <View className={`flex-1 ${colorScheme === "dark" ? "dark" : "light"}`}>
      <StatusBar style={colorScheme === "dark" ? "dark" : "light"} />

      <ToastProvider>
        <SQLiteProvider
          databaseName="myDatabase.db"
          onInit={initializeDatabase}
        >
          <Stack
            screenOptions={{
              header: () => (
                <SafeAreaView
                  className={`flex-row w-full h-24 items-center justify-between p-4 bg-primary`}
                >
                  <Text
                    className="text-white text-xl truncate w-1/2"
                    numberOfLines={1}
                  >
                    ชัยพร ศรเกษม
                  </Text>
                  <Link href="/settings" push asChild>
                    <Pressable>
                      <Feather name="settings" size={24} color="white" />
                    </Pressable>
                  </Link>
                </SafeAreaView>
              ),
              headerShown: true,
              // Add this to ensure the "under-layer" matches the theme
            }}
          />
        </SQLiteProvider>
      </ToastProvider>
    </View>
  );
}
