import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function useNotifications() {
  const CHANNEL_ID = "medme";
  const SOUND_FILE = "universfield-029.wav"; // Ensure this file is in the correct location

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: "Medication Reminders",
          importance: Notifications.AndroidImportance.MAX,
          // 3. Ensure this filename matches your app.json EXACTLY
          sound: SOUND_FILE,
          lightColor: "#FF231F7C",
        });
      }

      if (status === "granted") {
        console.log("Notification permissions granted.");
      }
    })();
  }, []);

  const triggerNotification = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Hello from MedMe! 👋",
        body: "This is a test notification.",
        sound: SOUND_FILE,
      },
      trigger: {
        seconds: 1,
        channelId: CHANNEL_ID, // Use the new ID here
      },
    });
  };

  return { triggerNotification };
}
