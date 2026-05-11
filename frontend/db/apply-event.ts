import { cancelNotificationsForMed, reconcileNotifications, scheduleNotificationsForMed } from "@/hooks/use-notifications";
import * as SQLite from "expo-sqlite";
import { readUserProfile } from "./firestore-ops";
import { SyncEvent } from "./sync-types";

type ApplyContext = {
  db: SQLite.SQLiteDatabase;
  selfClerkId: string;
  selfRole: "patient" | "caretaker";
};

async function resolvePatientLocalId(
  db: SQLite.SQLiteDatabase,
  patientClerkId: string,
): Promise<number | null> {
  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM patients WHERE clerk_user_id = ?`,
    [patientClerkId],
  );
  if (existing?.id) return existing.id;

  // Race condition safety net: the patient link exists remotely (otherwise this
  // event wouldn't have reached our inbox) but our local patients row hasn't
  // been written yet by use-sync-presence. Fetch the profile and create a stub
  // row inline so the schedule/log event doesn't get dropped.
  try {
    const profile = await readUserProfile(patientClerkId);
    if (!profile) return null;
    const fullName =
      [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Patient";
    await db.runAsync(
      `INSERT OR IGNORE INTO patients (name, image_uri, clerk_user_id, updated_at) VALUES (?, ?, ?, ?)`,
      [fullName, profile.imageUrl ?? null, profile.clerkId, new Date().toISOString()],
    );
    const created = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM patients WHERE clerk_user_id = ?`,
      [patientClerkId],
    );
    return created?.id ?? null;
  } catch (e) {
    console.warn("[sync] resolvePatientLocalId inline create failed", e);
    return null;
  }
}

async function findScheduleBySyncId(db: SQLite.SQLiteDatabase, syncId: string) {
  return db.getFirstAsync<{ id: number; updated_at: string | null; patient_id: number | null; notification_id: string | null }>(
    `SELECT id, updated_at, patient_id, notification_id FROM schedules WHERE sync_id = ?`,
    [syncId],
  );
}

async function findLogBySyncId(db: SQLite.SQLiteDatabase, syncId: string) {
  return db.getFirstAsync<{ id: number; updated_at: string | null }>(
    `SELECT id, updated_at FROM logs WHERE sync_id = ?`,
    [syncId],
  );
}

function shouldApply(localUpdatedAt: string | null, incomingUpdatedAt: string): boolean {
  if (!localUpdatedAt) return true;
  return incomingUpdatedAt >= localUpdatedAt;
}

async function applyScheduleUpsert(ctx: ApplyContext, event: SyncEvent) {
  const p = event.payload;
  const syncId: string = p.sync_id;
  if (!syncId) return;

  const existing = await findScheduleBySyncId(ctx.db, syncId);
  if (existing && !shouldApply(existing.updated_at, event.sourceUpdatedAt)) return;

  let localPatientId: number | null;
  if (ctx.selfRole === "caretaker") {
    localPatientId = await resolvePatientLocalId(ctx.db, p.patient_clerk_id);
    if (localPatientId == null) {
      console.warn(`[sync] schedule event for unknown patient ${p.patient_clerk_id?.slice(0, 8)} — skipping`);
      return;
    }
  } else {
    localPatientId = null;
  }

  const oldNotifId = existing?.notification_id ?? null;

  await ctx.db.runAsync(
    `INSERT INTO schedules
      (sync_id, medicine_name, type, count, whenToTake, additional, notification_id,
       stock, expiration_date, image_uri, repeat_days, start_date, end_date, patient_id, updated_at, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sync_id) DO UPDATE SET
       medicine_name = excluded.medicine_name,
       type = excluded.type,
       count = excluded.count,
       whenToTake = excluded.whenToTake,
       additional = excluded.additional,
       stock = excluded.stock,
       expiration_date = excluded.expiration_date,
       image_uri = excluded.image_uri,
       repeat_days = excluded.repeat_days,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       updated_at = excluded.updated_at,
       kind = excluded.kind`,
    [
      syncId, p.medicine_name, p.type ?? null, p.count ?? null, p.whenToTake ?? null,
      p.additional ?? null, null, p.stock ?? 0, p.expiration_date ?? null,
      p.image_uri ?? null, p.repeat_days ?? "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
      p.start_date ?? null, p.end_date ?? null, localPatientId, event.sourceUpdatedAt,
      p.kind ?? "medication",
    ],
  );

  if (oldNotifId) {
    try { await cancelNotificationsForMed(oldNotifId); } catch { /* already gone */ }
  }
  try {
    const newIds = await scheduleNotificationsForMed({
      medicineName: p.medicine_name,
      whenToTake: p.whenToTake ?? "",
      repeatDays: p.repeat_days ?? "",
      stock: p.stock ?? 0,
      count: p.count ?? 1,
      startDate: p.start_date ?? undefined,
      endDate: p.end_date ?? undefined,
      patientId: localPatientId,
    });
    await ctx.db.runAsync(`UPDATE schedules SET notification_id = ? WHERE sync_id = ?`, [newIds, syncId]);
  } catch (e) {
    console.warn("[sync] failed to schedule notifications locally", e);
  }
}

async function applyScheduleDelete(ctx: ApplyContext, event: SyncEvent) {
  const syncId: string = event.payload.sync_id;
  if (!syncId) return;
  const row = await ctx.db.getFirstAsync<{ notification_id: string | null }>(
    `SELECT notification_id FROM schedules WHERE sync_id = ?`,
    [syncId],
  );
  if (row?.notification_id) {
    try { await cancelNotificationsForMed(row.notification_id); } catch { /* already gone */ }
  }
  await ctx.db.runAsync(`DELETE FROM schedules WHERE sync_id = ?`, [syncId]);
  // Catch any orphan OS notifications now that the row is gone.
  reconcileNotifications(ctx.db).catch((e) => console.warn("post-delete reconcile failed", e));
}

async function applyLogUpsert(ctx: ApplyContext, event: SyncEvent): Promise<boolean> {
  const p = event.payload;
  const syncId: string = p.sync_id;
  if (!syncId) return true;

  const existing = await findLogBySyncId(ctx.db, syncId);
  if (existing && !shouldApply(existing.updated_at, event.sourceUpdatedAt)) return true;

  let localPatientId: number | null = null;
  if (ctx.selfRole === "caretaker") {
    localPatientId = await resolvePatientLocalId(ctx.db, p.patient_clerk_id);
    if (localPatientId == null) return false;  // retry: patient row not yet local
  }

  // Resolve schedule by sync_id only; the sender's local schedule_id is meaningless
  // to us. Fall back to sender's schedule_id ONLY when self is the patient and the
  // schedule existed locally (same device), i.e. identical IDs.
  const scheduleRow = await ctx.db.getFirstAsync<{ id: number }>(
    `SELECT id FROM schedules WHERE sync_id = ?`,
    [p.schedule_sync_id ?? ""],
  );
  const scheduleId =
    scheduleRow?.id ?? (ctx.selfRole === "patient" ? p.schedule_id ?? null : null);
  if (scheduleId == null) {
    // Schedule hasn't arrived yet — signal retry so the event isn't dropped.
    return false;
  }

  await ctx.db.runAsync(
    `INSERT INTO logs
      (sync_id, schedule_id, scheduled_time, log_date, timestamp, status, patient_id, updated_at, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sync_id) DO UPDATE SET
       schedule_id = excluded.schedule_id,
       scheduled_time = excluded.scheduled_time,
       log_date = excluded.log_date,
       timestamp = excluded.timestamp,
       status = excluded.status,
       updated_at = excluded.updated_at,
       value = excluded.value`,
    [syncId, scheduleId, p.scheduled_time, p.log_date, p.timestamp, p.status, localPatientId, event.sourceUpdatedAt, p.value ?? null],
  );
  return true;
}

async function applyLogDelete(ctx: ApplyContext, event: SyncEvent) {
  const syncId: string = event.payload.sync_id;
  if (!syncId) return;
  await ctx.db.runAsync(`DELETE FROM logs WHERE sync_id = ?`, [syncId]);
}

async function applyLinkRemove(ctx: ApplyContext, _event: SyncEvent) {
  if (ctx.selfRole === "patient") {
    await ctx.db.runAsync(`DELETE FROM patient_links WHERE patient_clerk_id = ?`, [ctx.selfClerkId]);
  }
}

// Returns true if the event was applied (or intentionally a no-op), false if
// it should be retried later (e.g. log arrived before its schedule).
export async function applyEvent(ctx: ApplyContext, event: SyncEvent): Promise<boolean> {
  switch (event.type) {
    case "schedule.upsert": await applyScheduleUpsert(ctx, event); return true;
    case "schedule.delete": await applyScheduleDelete(ctx, event); return true;
    case "log.upsert": return await applyLogUpsert(ctx, event);
    case "log.delete": await applyLogDelete(ctx, event); return true;
    case "link.remove": await applyLinkRemove(ctx, event); return true;
    case "patient.roster.upsert":
    case "patient.roster.delete":
    case "link.create":
      return true;
    default:
      return true;
  }
}
