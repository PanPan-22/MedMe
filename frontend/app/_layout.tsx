import { initializeDatabase } from "@/db/initialize";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar"; // Import from here
import { useColorScheme } from "nativewind";
import "../global.css";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    // Add these two to satisfy the TypeScript error:
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "dark" : "light"} />
      <SQLiteProvider databaseName="myDatabase.db" onInit={initializeDatabase}>
        <Stack />
      </SQLiteProvider>
    </>
  );
}
