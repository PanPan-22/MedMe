import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";
import { EventType, OutboxRow, PatientLink, SyncEvent } from "./sync-types";

export const newId = () => Crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export async function enqueue(
  db: SQLite.SQLiteDatabase,
  params: {
    targetClerkId: string;
    type: EventType;
    payload: Record<string, any>;
    sourceUpdatedAt?: string;
  },
): Promise<string> {
  const eventId = newId();
  const createdAt = nowIso();
  const sourceUpdatedAt = params.sourceUpdatedAt ?? createdAt;
  await db.runAsync(
    `INSERT INTO outbox (event_id, target_clerk_id, type, payload, source_updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [eventId, params.targetClerkId, params.type, JSON.stringify(params.payload), sourceUpdatedAt, createdAt],
  );
  return eventId;
}

export async function pendingOutbox(db: SQLite.SQLiteDatabase, limit = 50): Promise<OutboxRow[]> {
  return db.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox ORDER BY id ASC LIMIT ?`,
    [limit],
  );
}

export async function removeFromOutbox(db: SQLite.SQLiteDatabase, eventId: string) {
  await db.runAsync(`DELETE FROM outbox WHERE event_id = ?`, [eventId]);
}

export async function markOutboxFailure(db: SQLite.SQLiteDatabase, eventId: string, err: string) {
  await db.runAsync(
    `UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE event_id = ?`,
    [err, eventId],
  );
}

export async function hasProcessed(db: SQLite.SQLiteDatabase, eventId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ event_id: string }>(
    `SELECT event_id FROM inbox_processed WHERE event_id = ?`,
    [eventId],
  );
  return !!row;
}

export async function markProcessed(db: SQLite.SQLiteDatabase, eventId: string) {
  await db.runAsync(
    `INSERT OR IGNORE INTO inbox_processed (event_id, processed_at) VALUES (?, ?)`,
    [eventId, nowIso()],
  );
}

export async function getLink(db: SQLite.SQLiteDatabase, patientClerkId: string): Promise<PatientLink | null> {
  const row = await db.getFirstAsync<PatientLink>(
    `SELECT * FROM patient_links WHERE patient_clerk_id = ?`,
    [patientClerkId],
  );
  return row ?? null;
}

export async function upsertLink(db: SQLite.SQLiteDatabase, link: PatientLink) {
  await db.runAsync(
    `INSERT INTO patient_links (patient_clerk_id, caretaker_clerk_id, linked_at)
     VALUES (?, ?, ?)
     ON CONFLICT(patient_clerk_id) DO UPDATE SET
       caretaker_clerk_id = excluded.caretaker_clerk_id,
       linked_at = excluded.linked_at`,
    [link.patient_clerk_id, link.caretaker_clerk_id, link.linked_at],
  );
}

export async function removeLink(db: SQLite.SQLiteDatabase, patientClerkId: string) {
  await db.runAsync(`DELETE FROM patient_links WHERE patient_clerk_id = ?`, [patientClerkId]);
}

export function rowToSyncEvent(row: OutboxRow, sourceClerkId: string): SyncEvent {
  return {
    eventId: row.event_id,
    sourceClerkId,
    targetClerkId: row.target_clerk_id,
    type: row.type,
    payload: JSON.parse(row.payload),
    sourceUpdatedAt: row.source_updated_at,
    createdAt: row.created_at,
  };
}
