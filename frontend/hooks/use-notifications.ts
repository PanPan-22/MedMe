import * as Notifications from "expo-notifications";
import type { SQLiteDatabase } from "expo-sqlite";
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

      const threadId = `med-${patientId ?? "self"}-${timeStr}`;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "💊 Time for your medication",
          body: medicineName,
          sound: SOUND_FILE,
          data: { time: timeStr, patientId: patientId ?? null },
          threadIdentifier: threadId,
          categoryIdentifier: threadId,
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

interface ScheduleRow {
  id: number;
  medicine_name: string;
  whenToTake: string | null;
  repeat_days: string | null;
  stock: number | null;
  count: number | null;
  start_date: string | null;
  patient_id: number | null;
  notification_id: string | null;
  kind: string | null;
}

export async function reconcileNotifications(
  db: SQLiteDatabase,
): Promise<{ canceled: number; rescheduled: number }> {
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const existingIds = new Set(existing.map((n) => n.identifier));

  const schedules = await db.getAllAsync<ScheduleRow>(
    `SELECT id, medicine_name, whenToTake, repeat_days, stock, count,
            start_date, patient_id, notification_id, kind
     FROM schedules`,
  );

  const claimed = new Set<string>();
  for (const s of schedules) {
    for (const id of (s.notification_id ?? "").split(",").filter(Boolean)) {
      claimed.add(id);
    }
  }

  let canceled = 0;
  for (const n of existing) {
    if (!claimed.has(n.identifier)) {
      try {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
        canceled++;
      } catch { /* ignore */ }
    }
  }

  let rescheduled = 0;
  for (const s of schedules) {
    const claimedIds = (s.notification_id ?? "").split(",").filter(Boolean);
    const hasTimes = !!s.whenToTake?.trim();
    const hasDays = !!s.repeat_days?.trim();
    const shouldHaveNotifs = (s.stock ?? 0) > 0 && (s.count ?? 0) > 0 && hasTimes && hasDays;
    const missingSome = claimedIds.some((id) => !existingIds.has(id));
    const hasNoneButShould = claimedIds.length === 0 && shouldHaveNotifs;

    if (!shouldHaveNotifs) {
      if (claimedIds.length > 0) {
        for (const id of claimedIds) {
          try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* ignore */ }
        }
        await db.runAsync(`UPDATE schedules SET notification_id = '' WHERE id = ?`, [s.id]);
      }
      continue;
    }

    if (missingSome || hasNoneButShould) {
      for (const id of claimedIds) {
        try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* ignore */ }
      }
      const newIds = await scheduleNotificationsForMed({
        medicineName: s.medicine_name,
        whenToTake: s.whenToTake ?? "",
        repeatDays: s.repeat_days ?? "",
        stock: s.stock ?? 0,
        count: s.count ?? 1,
        startDate: s.start_date ?? undefined,
        patientId: s.patient_id,
      });
      await db.runAsync(`UPDATE schedules SET notification_id = ? WHERE id = ?`, [newIds, s.id]);
      rescheduled++;
    }
  }

  return { canceled, rescheduled };
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
