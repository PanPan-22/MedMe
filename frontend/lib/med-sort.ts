import type { Schedule } from "@/components/local-db";

export type MedSortMode = "default" | "alphabetical" | "next_time";
export type PatientSortMode = "default" | "alphabetical";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface UpcomingSlot {
  time: string;
  dayOffset: number;
  meds: Schedule[];
}

export function getUpcomingSlots(meds: Schedule[], limit = 5, now = new Date()): UpcomingSlot[] {
  const currentDayIdx = now.getDay();
  const currentHHMM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  const slots: UpcomingSlot[] = [];
  for (let offset = 0; offset < 7 && slots.length < limit; offset++) {
    const dayName = DAY_NAMES[(currentDayIdx + offset) % 7];
    const dayMap = new Map<string, Schedule[]>();
    for (const med of meds) {
      if (!med.repeat_days?.includes(dayName)) continue;
      for (const t of (med.whenToTake ?? "").split(",").filter(Boolean)) {
        if (offset === 0 && t <= currentHHMM) continue;
        if (!dayMap.has(t)) dayMap.set(t, []);
        dayMap.get(t)!.push(med);
      }
    }
    const sorted = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [time, medsAtTime] of sorted) {
      if (slots.length >= limit) break;
      slots.push({ time, dayOffset: offset, meds: medsAtTime });
    }
  }
  return slots;
}

export function getNextAlarm(meds: Schedule[], now = new Date()): { time: string; dayOffset: number } | null {
  const [first] = getUpcomingSlots(meds, 1, now);
  return first ? { time: first.time, dayOffset: first.dayOffset } : null;
}

export function slotDayLabelKey(dayOffset: number, now = new Date()): string | null {
  if (dayOffset === 0) return null;
  if (dayOffset === 1) return "tomorrow";
  const dayName = DAY_NAMES[(now.getDay() + dayOffset) % 7];
  return `day_${dayName.toLowerCase()}`;
}

export function msToNextDose(med: Schedule, now = new Date()): number {
  const times = (med.whenToTake ?? "").split(",").filter(Boolean);
  const days = (med.repeat_days ?? "").split(",").filter(Boolean);
  if (!times.length || !days.length) return Infinity;
  const currentDayIdx = now.getDay();
  let best = Infinity;
  for (let offset = 0; offset < 7; offset++) {
    const dayIdx = (currentDayIdx + offset) % 7;
    if (!days.includes(DAY_NAMES[dayIdx])) continue;
    for (const t of times) {
      const [hh, mm] = t.split(":").map(Number);
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      d.setHours(hh, mm, 0, 0);
      const delta = d.getTime() - now.getTime();
      if (delta >= 0 && delta < best) best = delta;
    }
  }
  return best;
}

export function sortMedications(meds: Schedule[], mode: MedSortMode, now = new Date()): Schedule[] {
  if (mode === "default") return meds;
  const sorted = [...meds];
  if (mode === "alphabetical") {
    sorted.sort((a, b) => a.medicine_name.localeCompare(b.medicine_name));
  } else if (mode === "next_time") {
    sorted.sort((a, b) => msToNextDose(a, now) - msToNextDose(b, now));
  }
  return sorted;
}
