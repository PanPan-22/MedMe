import * as Notifications from "expo-notifications";
import { useEffect } from "react";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function useNotifications() {
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === "granted") {
        console.log("Notification permissions granted.");
      } else {
        console.log("Notification permissions denied.");
      }
    })();
  }, []);

  const triggerNotification = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      console.log("Cannot trigger notification: permissions not granted.");
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Hello from MedMe! 👋",
        body: "This is a test notification. Tap to open the app.",
      },
      trigger: null, // Show immediately
    });
  };

  return { triggerNotification };
}
