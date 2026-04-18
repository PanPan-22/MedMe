import { cancelNotificationsForMed, scheduleNotificationsForMed } from "@/hooks/use-notifications";
import * as SQLite from "expo-sqlite";
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
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM patients WHERE clerk_user_id = ?`,
    [patientClerkId],
  );
  return row?.id ?? null;
}

async function findScheduleBySyncId(db: SQLite.SQLiteDatabase, syncId: string) {
  return db.getFirstAsync<{ id: number; updated_at: string | null; patient_id: number | null; notification_id: string | null }>(
    `SELECT id, updated_at, patient_id, notification_id FROM schedules WHERE sync_id = ?`,
    [syncId],
  );
}

async function findLogBySyncId(db: SQLite.SQLiteDatabase, syncId: string) {
  return db.getFirstAsync<{ id: number; updated_at: string | null }>(
    `SELECT id, updated_at FROM medication_logs WHERE sync_id = ?`,
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
       stock, expiration_date, image_uri, repeat_days, start_date, end_date, patient_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       updated_at = excluded.updated_at`,
    [
      syncId, p.medicine_name, p.type ?? null, p.count ?? null, p.whenToTake ?? null,
      p.additional ?? null, null, p.stock ?? 0, p.expiration_date ?? null,
      p.image_uri ?? null, p.repeat_days ?? "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
      p.start_date ?? null, p.end_date ?? null, localPatientId, event.sourceUpdatedAt,
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
      startDate: p.start_date,
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
  const result = await ctx.db.runAsync(`DELETE FROM schedules WHERE sync_id = ?`, [syncId]);
  console.log(`[sync] deleted ${result.changes} row(s) for sync_id ${syncId.slice(0, 8)}`);
}

async function applyLogUpsert(ctx: ApplyContext, event: SyncEvent) {
  const p = event.payload;
  const syncId: string = p.sync_id;
  if (!syncId) return;

  const existing = await findLogBySyncId(ctx.db, syncId);
  if (existing && !shouldApply(existing.updated_at, event.sourceUpdatedAt)) return;

  let localPatientId: number | null = null;
  if (ctx.selfRole === "caretaker") {
    localPatientId = await resolvePatientLocalId(ctx.db, p.patient_clerk_id);
    if (localPatientId == null) return;
  }

  const scheduleRow = await ctx.db.getFirstAsync<{ id: number }>(
    `SELECT id FROM schedules WHERE sync_id = ?`,
    [p.schedule_sync_id ?? ""],
  );
  const medicationId = scheduleRow?.id ?? p.medication_id ?? null;
  if (medicationId == null) return;

  await ctx.db.runAsync(
    `INSERT INTO medication_logs
      (sync_id, medication_id, scheduled_time, log_date, timestamp, status, patient_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sync_id) DO UPDATE SET
       medication_id = excluded.medication_id,
       scheduled_time = excluded.scheduled_time,
       log_date = excluded.log_date,
       timestamp = excluded.timestamp,
       status = excluded.status,
       updated_at = excluded.updated_at`,
    [syncId, medicationId, p.scheduled_time, p.log_date, p.timestamp, p.status, localPatientId, event.sourceUpdatedAt],
  );
}

async function applyLinkRemove(ctx: ApplyContext, _event: SyncEvent) {
  if (ctx.selfRole === "patient") {
    await ctx.db.runAsync(`DELETE FROM patient_links WHERE patient_clerk_id = ?`, [ctx.selfClerkId]);
  }
}

export async function applyEvent(ctx: ApplyContext, event: SyncEvent): Promise<void> {
  switch (event.type) {
    case "schedule.upsert": return applyScheduleUpsert(ctx, event);
    case "schedule.delete": return applyScheduleDelete(ctx, event);
    case "log.upsert": return applyLogUpsert(ctx, event);
    case "link.remove": return applyLinkRemove(ctx, event);
    case "patient.roster.upsert":
    case "patient.roster.delete":
    case "link.create":
      return;
    default:
      return;
  }
}
