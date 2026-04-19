import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

export const CHANNEL_ID = "medme";
const SOUND_FILE = "universfield_029.wav";

// iOS allows max 64 scheduled notifications per app; leave headroom for multiple meds
const MAX_NOTIFS_PER_MED = 60;
const MAX_DAYS_AHEAD = 365;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface ScheduleParams {
  medicineName: string;
  whenToTake: string;       // "08:00,20:00"
  repeatDays: string;       // "Mon,Tue,Wed,Thu,Fri,Sat,Sun"
  stock: number;
  count: number;
  startDate?: string;       // ISO date "2024-01-01", defaults to today
  patientId?: number | null;
}

export function calcEndDate(params: { stock: number; count: number; timesPerDay: number; startDate?: string }): Date {
  const { stock, count, timesPerDay, startDate } = params;
  const days = count > 0 && timesPerDay > 0 ? Math.floor(stock / (count * timesPerDay)) : 0;
  const base = startDate ? new Date(startDate + "T00:00:00") : new Date();
  const end = new Date(base);
  end.setDate(end.getDate() + days);
  return end;
}

export async function scheduleNotificationsForMed(params: ScheduleParams): Promise<string> {
  const { medicineName, whenToTake, repeatDays, stock, count, startDate, patientId } = params;

  const times = whenToTake.split(",").map(s => s.trim()).filter(Boolean);
  const days = new Set(repeatDays.split(",").map(s => s.trim()).filter(Boolean));

  if (count <= 0 || stock <= 0 || times.length === 0 || days.size === 0) return "";

  const totalDoses = Math.floor(stock / count);
  if (totalDoses === 0) return "";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startRef = startDate ? new Date(startDate + "T00:00:00") : todayStart;
  const iterStart = startRef < todayStart ? todayStart : new Date(startRef.getFullYear(), startRef.getMonth(), startRef.getDate());

  const ids: string[] = [];
  const limit = Math.min(totalDoses, MAX_NOTIFS_PER_MED);

  for (let d = 0; d < MAX_DAYS_AHEAD && ids.length < limit; d++) {
    const checkDate = new Date(iterStart);
    checkDate.setDate(checkDate.getDate() + d);

    const dayName = DAY_NAMES[checkDate.getDay()];
    if (!days.has(dayName)) continue;

    for (const timeStr of times) {
      if (ids.length >= limit) break;
      const [h, m] = timeStr.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) continue;

      const fireDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), h, m, 0);
      if (fireDate <= now) continue;

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "💊 Time for your medication",
          body: medicineName,
          sound: SOUND_FILE,
          data: { time: timeStr, patientId: patientId ?? null },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireDate,
          channelId: CHANNEL_ID,
        },
      });
      ids.push(id);
    }
  }

  return ids.join(",");
}

export async function cancelNotificationsForMed(notificationIds: string): Promise<void> {
  for (const id of notificationIds.split(",").filter(Boolean)) {
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* already gone */ }
  }
}

export function useNotifications() {
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync(
        Platform.OS === "ios"
          ? { ios: { allowAlert: true, allowBadge: true, allowSound: true } }
          : { android: { alarm: true } },
      );
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: "Medication Reminders",
          importance: Notifications.AndroidImportance.MAX,
          sound: SOUND_FILE,
          lightColor: "#FF231F7C",
          enableVibrate: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      }
      if (status === "granted") console.log("Notification permissions granted.");
    })();
  }, []);

  const triggerNotification = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    await Notifications.scheduleNotificationAsync({
      content: { title: "Hello from MedMe! 👋", body: "This is a test notification.", sound: SOUND_FILE },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: CHANNEL_ID },
    });
  };

  return { triggerNotification };
}
