import { initializeDatabase } from "@/db/initialize";
import Feather from "@expo/vector-icons/Feather";
import { Link, Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar"; // Import from here
import { useColorScheme } from "nativewind";
import { Pressable, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import "../global.css";

// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: false,
//     // Add these two to satisfy the TypeScript error:
//     shouldShowBanner: true,
//     shouldShowList: true,
//   }),
// });

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "dark" : "light"} />
      <SQLiteProvider databaseName="myDatabase.db" onInit={initializeDatabase}>
        <Stack
          screenOptions={{
            header: () => (
              <SafeAreaView className="flex-row w-full h-24 items-center justify-between p-4 bg-primary">
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
            animation: "default",
          }}
        />
      </SQLiteProvider>
    </>
  );
}
