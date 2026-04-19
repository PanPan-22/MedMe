import { cancelNotificationsForMed } from "@/hooks/use-notifications";
import * as SQLite from "expo-sqlite";
import { enqueue, getLink, newId, nowIso } from "./sync-db";

type Role = "patient" | "caretaker";

async function resolveTarget(
  db: SQLite.SQLiteDatabase,
  selfClerkId: string,
  selfRole: Role,
  patientLocalId: number | null | undefined,
): Promise<{ targetClerkId: string | null; patientClerkId: string | null }> {
  if (selfRole === "patient") {
    const link = await getLink(db, selfClerkId);
    return { targetClerkId: link?.caretaker_clerk_id ?? null, patientClerkId: selfClerkId };
  }
  if (patientLocalId == null) return { targetClerkId: null, patientClerkId: null };
  const row = await db.getFirstAsync<{ clerk_user_id: string | null }>(
    `SELECT clerk_user_id FROM patients WHERE id = ?`,
    [patientLocalId],
  );
  const patientClerkId = row?.clerk_user_id ?? null;
  return { targetClerkId: patientClerkId, patientClerkId };
}

export interface ScheduleInsertInput {
  medicine_name: string;
  type: string | null;
  count: number | null;
  whenToTake: string | null;
  additional?: string | null;
  notification_id?: string | null;
  stock: number;
  expiration_date?: string | null;
  image_uri?: string | null;
  repeat_days: string;
  start_date: string | null;
  end_date: string | null;
  patient_id: number | null;
  kind?: string;
}

export async function insertScheduleAndSync(
  db: SQLite.SQLiteDatabase,
  selfClerkId: string,
  selfRole: Role,
  input: ScheduleInsertInput,
): Promise<{ id: number; sync_id: string }> {
  const syncId = newId();
  const updatedAt = nowIso();
  const result = await db.runAsync(
    `INSERT INTO schedules
      (sync_id, medicine_name, type, count, whenToTake, additional, notification_id,
       stock, expiration_date, image_uri, repeat_days, start_date, end_date, patient_id, updated_at, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      syncId, input.medicine_name, input.type, input.count, input.whenToTake,
      input.additional ?? null, input.notification_id ?? null, input.stock,
      input.expiration_date ?? null, input.image_uri ?? null, input.repeat_days,
      input.start_date, input.end_date, input.patient_id, updatedAt, input.kind ?? "medication",
    ],
  );

  const { targetClerkId, patientClerkId } = await resolveTarget(db, selfClerkId, selfRole, input.patient_id);
  if (targetClerkId && patientClerkId) {
    await enqueue(db, {
      targetClerkId,
      type: "schedule.upsert",
      payload: {
        sync_id: syncId,
        patient_clerk_id: patientClerkId,
        ...input,
        patient_id: undefined,
      },
      sourceUpdatedAt: updatedAt,
    });
  }

  return { id: result.lastInsertRowId, sync_id: syncId };
}

export async function updateScheduleAndSync(
  db: SQLite.SQLiteDatabase,
  selfClerkId: string,
  selfRole: Role,
  localId: number,
  fields: Partial<ScheduleInsertInput>,
): Promise<void> {
  const updatedAt = nowIso();
  const existing = await db.getFirstAsync<{
    sync_id: string | null; patient_id: number | null;
    medicine_name: string; type: string | null; count: number | null; whenToTake: string | null;
    additional: string | null; notification_id: string | null; stock: number | null;
    expiration_date: string | null; image_uri: string | null; repeat_days: string | null;
    start_date: string | null; end_date: string | null; kind: string | null;
  }>(`SELECT * FROM schedules WHERE id = ?`, [localId]);
  if (!existing) return;

  let syncId = existing.sync_id;
  if (!syncId) {
    syncId = newId();
    await db.runAsync(`UPDATE schedules SET sync_id = ? WHERE id = ?`, [syncId, localId]);
  }

  const merged: ScheduleInsertInput = {
    medicine_name: fields.medicine_name ?? existing.medicine_name,
    type: fields.type ?? existing.type,
    count: fields.count ?? existing.count,
    whenToTake: fields.whenToTake ?? existing.whenToTake,
    additional: fields.additional ?? existing.additional,
    notification_id: fields.notification_id ?? existing.notification_id,
    stock: fields.stock ?? existing.stock ?? 0,
    expiration_date: fields.expiration_date ?? existing.expiration_date,
    image_uri: fields.image_uri ?? existing.image_uri,
    repeat_days: fields.repeat_days ?? existing.repeat_days ?? "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
    start_date: fields.start_date ?? existing.start_date,
    end_date: fields.end_date ?? existing.end_date,
    patient_id: existing.patient_id,
    kind: fields.kind ?? existing.kind ?? "medication",
  };

  await db.runAsync(
    `UPDATE schedules SET
       medicine_name = ?, type = ?, count = ?, whenToTake = ?, additional = ?,
       notification_id = ?, stock = ?, expiration_date = ?, image_uri = ?,
       repeat_days = ?, start_date = ?, end_date = ?, updated_at = ?
     WHERE id = ?`,
    [
      merged.medicine_name, merged.type, merged.count, merged.whenToTake, merged.additional,
      merged.notification_id, merged.stock, merged.expiration_date, merged.image_uri,
      merged.repeat_days, merged.start_date, merged.end_date, updatedAt, localId,
    ],
  );

  const { targetClerkId, patientClerkId } = await resolveTarget(db, selfClerkId, selfRole, existing.patient_id);
  if (targetClerkId && patientClerkId) {
    await enqueue(db, {
      targetClerkId,
      type: "schedule.upsert",
      payload: {
        sync_id: syncId,
        patient_clerk_id: patientClerkId,
        ...merged,
        patient_id: undefined,
      },
      sourceUpdatedAt: updatedAt,
    });
  }
}

export async function deleteScheduleAndSync(
  db: SQLite.SQLiteDatabase,
  selfClerkId: string,
  selfRole: Role,
  localId: number,
): Promise<void> {
  const existing = await db.getFirstAsync<{ sync_id: string | null; patient_id: number | null; notification_id: string | null }>(
    `SELECT sync_id, patient_id, notification_id FROM schedules WHERE id = ?`,
    [localId],
  );
  if (!existing) return;
  if (existing.notification_id) {
    try { await cancelNotificationsForMed(existing.notification_id); } catch { /* already gone */ }
  }
  await db.runAsync(`DELETE FROM schedules WHERE id = ?`, [localId]);

  const syncId = existing.sync_id;
  if (!syncId) return;
  const { targetClerkId, patientClerkId } = await resolveTarget(db, selfClerkId, selfRole, existing.patient_id);
  if (targetClerkId && patientClerkId) {
    await enqueue(db, {
      targetClerkId,
      type: "schedule.delete",
      payload: { sync_id: syncId, patient_clerk_id: patientClerkId },
      sourceUpdatedAt: nowIso(),
    });
  }
}

export interface LogInsertInput {
  medication_id: number;
  scheduled_time: string;
  log_date: string;
  timestamp: string;
  status: "taken" | "skipped" | "recorded";
  patient_id: number | null;
  value?: string | null;
}

export async function insertLogAndSync(
  db: SQLite.SQLiteDatabase,
  selfClerkId: string,
  selfRole: Role,
  input: LogInsertInput,
): Promise<void> {
  const syncId = newId();
  const updatedAt = nowIso();
  await db.runAsync(
    `INSERT INTO medication_logs
      (sync_id, medication_id, scheduled_time, log_date, timestamp, status, patient_id, updated_at, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [syncId, input.medication_id, input.scheduled_time, input.log_date, input.timestamp, input.status, input.patient_id, updatedAt, input.value ?? null],
  );

  const scheduleRow = await db.getFirstAsync<{ sync_id: string | null }>(
    `SELECT sync_id FROM schedules WHERE id = ?`,
    [input.medication_id],
  );

  const { targetClerkId, patientClerkId } = await resolveTarget(db, selfClerkId, selfRole, input.patient_id);
  if (targetClerkId && patientClerkId) {
    await enqueue(db, {
      targetClerkId,
      type: "log.upsert",
      payload: {
        sync_id: syncId,
        patient_clerk_id: patientClerkId,
        schedule_sync_id: scheduleRow?.sync_id ?? null,
        medication_id: input.medication_id,
        scheduled_time: input.scheduled_time,
        log_date: input.log_date,
        timestamp: input.timestamp,
        status: input.status,
        value: input.value ?? null,
      },
      sourceUpdatedAt: updatedAt,
    });
  }
}
