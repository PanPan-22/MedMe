import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import type { SQLiteDatabase } from "expo-sqlite";
import { useEffect } from "react";
import { Platform } from "react-native";

export const CHANNEL_ID = "medme";
export const SOUND_FILES = [
  "universfield_023.wav",
  "universfield_029.wav",
  "universfield_030.wav",
  "universfield_088.wav",
  "universfield_091.wav",
];
// Static requires so Metro bundles the assets — order must match SOUND_FILES.
export const SOUND_SOURCES = [
  require("../assets/audios/universfield_023.wav"),
  require("../assets/audios/universfield_029.wav"),
  require("../assets/audios/universfield_030.wav"),
  require("../assets/audios/universfield_088.wav"),
  require("../assets/audios/universfield_091.wav"),
];
const DEFAULT_SOUND_INDEX = 1; // universfield_029.wav (matches previous default)
const SOUND_KEY = "notificationSoundIndex";

export async function getSelectedSoundIndex(): Promise<number> {
  const v = await SecureStore.getItemAsync(SOUND_KEY);
  const n = v == null ? DEFAULT_SOUND_INDEX : parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 && n < SOUND_FILES.length ? n : DEFAULT_SOUND_INDEX;
}

export async function getSelectedSoundFile(): Promise<string> {
  return SOUND_FILES[await getSelectedSoundIndex()];
}

async function ensureChannelWithSound(soundFile: string) {
  if (Platform.OS !== "android") return;
  // Channels are immutable once created — delete then recreate to pick up a new sound.
  try { await Notifications.deleteNotificationChannelAsync(CHANNEL_ID); } catch { /* not yet created */ }
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Medication Reminders",
    importance: Notifications.AndroidImportance.MAX,
    sound: soundFile,
    lightColor: "#FF231F7C",
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function setSelectedSoundIndex(index: number): Promise<void> {
  if (index < 0 || index >= SOUND_FILES.length) return;
  await SecureStore.setItemAsync(SOUND_KEY, String(index));
  await ensureChannelWithSound(SOUND_FILES[index]);
}

// Android's AlarmManager caps concurrent alarms per UID at 500.
// iOS caps scheduled notifications per app at 64.
// We keep per-med low and reconcile on each app launch to top up as alarms fire.
const MAX_NOTIFS_PER_MED = 30;     // ~10 days at 3 doses/day
const MAX_DAYS_AHEAD = 365;
const MAX_TOTAL_NOTIFS = 450;      // leave 50-alarm headroom below Android's 500 cap

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
  endDate?: string | null;  // ISO date — no notifications past this date
  patientId?: number | null;
}

export async function scheduleNotificationsForMed(params: ScheduleParams): Promise<string> {
  const { medicineName, whenToTake, repeatDays, stock, count, startDate, endDate, patientId } = params;
  const soundFile = await getSelectedSoundFile();

  const times = whenToTake.split(",").map(s => s.trim()).filter(Boolean);
  const days = new Set(repeatDays.split(",").map(s => s.trim()).filter(Boolean));

  if (count <= 0 || stock <= 0 || times.length === 0 || days.size === 0) return "";

  const totalDoses = Math.floor(stock / count);
  if (totalDoses === 0) return "";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startRef = startDate ? new Date(startDate + "T00:00:00") : todayStart;
  const iterStart = startRef < todayStart ? todayStart : new Date(startRef.getFullYear(), startRef.getMonth(), startRef.getDate());
  // End-of-day on end_date (inclusive). Null/undefined = no end.
  const endLimit = endDate ? new Date(endDate + "T23:59:59") : null;

  // Respect the per-app concurrent-alarm cap. If we're already close to 500
  // (Android's AlarmManager limit), schedule fewer for this med so we don't
  // throw at the OS layer. Reconcile-on-launch refills as alarms fire.
  const currentCount = (await Notifications.getAllScheduledNotificationsAsync()).length;
  const headroom = Math.max(0, MAX_TOTAL_NOTIFS - currentCount);

  const ids: string[] = [];
  const limit = Math.min(totalDoses, MAX_NOTIFS_PER_MED, headroom);
  if (limit === 0) {
    console.warn(`[notif] global cap reached (${currentCount}/${MAX_TOTAL_NOTIFS}); skipping ${medicineName}`);
    return "";
  }

  for (let d = 0; d < MAX_DAYS_AHEAD && ids.length < limit; d++) {
    const checkDate = new Date(iterStart);
    checkDate.setDate(checkDate.getDate() + d);
    // Past end_date — stop iterating, nothing more will fire.
    if (endLimit && checkDate > endLimit) break;

    const dayName = DAY_NAMES[checkDate.getDay()];
    if (!days.has(dayName)) continue;

    for (const timeStr of times) {
      if (ids.length >= limit) break;
      const [h, m] = timeStr.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) continue;

      const fireDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), h, m, 0);
      if (fireDate <= now) continue;
      if (endLimit && fireDate > endLimit) continue;

      const threadId = `med-${patientId ?? "self"}-${timeStr}`;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "💊 Time for your medication",
          body: medicineName,
          sound: soundFile,
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
  end_date: string | null;
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
            start_date, end_date, patient_id, notification_id, kind
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
        endDate: s.end_date ?? undefined,
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
        await ensureChannelWithSound(await getSelectedSoundFile());
      }
      if (status !== "granted") console.warn("Notification permissions not granted");
    })();
  }, []);

  const triggerNotification = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    const soundFile = await getSelectedSoundFile();
    await Notifications.scheduleNotificationAsync({
      content: { title: "Hello from MedMe! 👋", body: "This is a test notification.", sound: soundFile },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: CHANNEL_ID },
    });
  };

  return { triggerNotification };
}
