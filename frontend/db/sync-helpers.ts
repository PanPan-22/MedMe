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
      merged.medicine_name, merged.type, merged.count, merged.whenToTake, merged.additional ?? null,
      merged.notification_id ?? null, merged.stock, merged.expiration_date ?? null, merged.image_uri ?? null,
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
  schedule_id: number;
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
    `INSERT INTO logs
      (sync_id, schedule_id, scheduled_time, log_date, timestamp, status, patient_id, updated_at, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [syncId, input.schedule_id, input.scheduled_time, input.log_date, input.timestamp, input.status, input.patient_id, updatedAt, input.value ?? null],
  );

  const scheduleRow = await db.getFirstAsync<{ sync_id: string | null }>(
    `SELECT sync_id FROM schedules WHERE id = ?`,
    [input.schedule_id],
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
        schedule_id: input.schedule_id,
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

export async function updateLogAndSync(
  db: SQLite.SQLiteDatabase,
  selfClerkId: string,
  selfRole: Role,
  localId: number,
  fields: Partial<{ status: "taken" | "skipped" | "recorded"; value: string | null; timestamp: string }>,
): Promise<void> {
  const updatedAt = nowIso();
  const existing = await db.getFirstAsync<{
    sync_id: string | null; schedule_id: number; patient_id: number | null;
    scheduled_time: string; log_date: string; timestamp: string; status: string; value: string | null;
  }>(`SELECT * FROM logs WHERE id = ?`, [localId]);
  if (!existing) return;

  let syncId = existing.sync_id;
  if (!syncId) {
    syncId = newId();
    await db.runAsync(`UPDATE logs SET sync_id = ? WHERE id = ?`, [syncId, localId]);
  }

  const merged = {
    status: fields.status ?? existing.status,
    value: fields.value !== undefined ? fields.value : existing.value,
    timestamp: fields.timestamp ?? existing.timestamp,
  };

  await db.runAsync(
    `UPDATE logs SET status = ?, value = ?, timestamp = ?, updated_at = ? WHERE id = ?`,
    [merged.status, merged.value, merged.timestamp, updatedAt, localId],
  );

  const scheduleRow = await db.getFirstAsync<{ sync_id: string | null }>(
    `SELECT sync_id FROM schedules WHERE id = ?`, [existing.schedule_id],
  );

  const { targetClerkId, patientClerkId } = await resolveTarget(db, selfClerkId, selfRole, existing.patient_id);
  if (targetClerkId && patientClerkId) {
    await enqueue(db, {
      targetClerkId,
      type: "log.upsert",
      payload: {
        sync_id: syncId,
        patient_clerk_id: patientClerkId,
        schedule_sync_id: scheduleRow?.sync_id ?? null,
        schedule_id: existing.schedule_id,
        scheduled_time: existing.scheduled_time,
        log_date: existing.log_date,
        timestamp: merged.timestamp,
        status: merged.status,
        value: merged.value,
      },
      sourceUpdatedAt: updatedAt,
    });
  }
}

export async function deleteLogAndSync(
  db: SQLite.SQLiteDatabase,
  selfClerkId: string,
  selfRole: Role,
  localId: number,
): Promise<void> {
  const existing = await db.getFirstAsync<{ sync_id: string | null; patient_id: number | null }>(
    `SELECT sync_id, patient_id FROM logs WHERE id = ?`, [localId],
  );
  if (!existing) return;
  await db.runAsync(`DELETE FROM logs WHERE id = ?`, [localId]);

  const syncId = existing.sync_id;
  if (!syncId) return;
  const { targetClerkId, patientClerkId } = await resolveTarget(db, selfClerkId, selfRole, existing.patient_id);
  if (targetClerkId && patientClerkId) {
    await enqueue(db, {
      targetClerkId,
      type: "log.delete",
      payload: { sync_id: syncId, patient_clerk_id: patientClerkId },
      sourceUpdatedAt: nowIso(),
    });
  }
}

/**
 * Push every local schedule + log owned by the patient up to a newly linked caretaker.
 * Used when a patient has existing data from before pairing, or re-links after an unlink.
 * Safe to call repeatedly — event_id dedup on the caretaker side prevents double-apply.
 */
export async function backfillToCaretaker(
  db: SQLite.SQLiteDatabase,
  patientClerkId: string,
  caretakerClerkId: string,
): Promise<{ schedules: number; logs: number }> {
  const schedules = await db.getAllAsync<{
    id: number; sync_id: string | null;
    medicine_name: string; type: string | null; count: number | null;
    whenToTake: string | null; additional: string | null; stock: number | null;
    expiration_date: string | null; image_uri: string | null;
    repeat_days: string | null; start_date: string | null; end_date: string | null;
    kind: string | null; updated_at: string | null;
  }>(
    `SELECT id, sync_id, medicine_name, type, count, whenToTake, additional, stock,
            expiration_date, image_uri, repeat_days, start_date, end_date, kind, updated_at
     FROM schedules WHERE patient_id IS NULL`,
  );

  let scheduleCount = 0;
  for (const s of schedules) {
    let syncId = s.sync_id;
    if (!syncId) {
      syncId = newId();
      await db.runAsync(`UPDATE schedules SET sync_id = ? WHERE id = ?`, [syncId, s.id]);
    }
    await enqueue(db, {
      targetClerkId: caretakerClerkId,
      type: "schedule.upsert",
      payload: {
        sync_id: syncId,
        patient_clerk_id: patientClerkId,
        medicine_name: s.medicine_name,
        type: s.type,
        count: s.count,
        whenToTake: s.whenToTake,
        additional: s.additional,
        stock: s.stock ?? 0,
        expiration_date: s.expiration_date,
        image_uri: s.image_uri,
        repeat_days: s.repeat_days ?? "Mon,Tue,Wed,Thu,Fri,Sat,Sun",
        start_date: s.start_date,
        end_date: s.end_date,
        kind: s.kind ?? "medication",
      },
      sourceUpdatedAt: s.updated_at ?? nowIso(),
    });
    scheduleCount++;
  }

  const logs = await db.getAllAsync<{
    id: number; sync_id: string | null; schedule_id: number;
    scheduled_time: string; log_date: string; timestamp: string;
    status: string; value: string | null; updated_at: string | null;
    schedule_sync_id: string | null;
  }>(
    `SELECT l.id, l.sync_id, l.schedule_id, l.scheduled_time, l.log_date, l.timestamp,
            l.status, l.value, l.updated_at, s.sync_id AS schedule_sync_id
     FROM logs l
     LEFT JOIN schedules s ON l.schedule_id = s.id
     WHERE l.patient_id IS NULL`,
  );

  let logCount = 0;
  for (const lg of logs) {
    let syncId = lg.sync_id;
    if (!syncId) {
      syncId = newId();
      await db.runAsync(`UPDATE logs SET sync_id = ? WHERE id = ?`, [syncId, lg.id]);
    }
    await enqueue(db, {
      targetClerkId: caretakerClerkId,
      type: "log.upsert",
      payload: {
        sync_id: syncId,
        patient_clerk_id: patientClerkId,
        schedule_sync_id: lg.schedule_sync_id,
        schedule_id: lg.schedule_id,
        scheduled_time: lg.scheduled_time,
        log_date: lg.log_date,
        timestamp: lg.timestamp,
        status: lg.status,
        value: lg.value,
      },
      sourceUpdatedAt: lg.updated_at ?? lg.timestamp,
    });
    logCount++;
  }

  return { schedules: scheduleCount, logs: logCount };
}
