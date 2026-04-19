import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import * as SQLite from "expo-sqlite";
import { firestore } from "../firebaseConfig";
import { SNAPSHOTS_COLLECTION } from "./sync-types";

interface ScheduleRow {
  id: number; sync_id: string | null; medicine_name: string; type: string | null;
  count: number | null; whenToTake: string | null; additional: string | null;
  notification_id: string | null; stock: number | null; expiration_date: string | null;
  image_uri: string | null; repeat_days: string | null; start_date: string | null;
  end_date: string | null; patient_id: number | null; updated_at: string | null;
  kind: string | null;
}

interface LogRow {
  id: number; sync_id: string | null; medication_id: number; scheduled_time: string;
  log_date: string; timestamp: string; status: string; patient_id: number | null;
  updated_at: string | null; value: string | null;
}

interface PatientRow {
  id: number; name: string;
  image_uri: string | null; clerk_user_id: string | null; updated_at: string | null;
}

export interface Snapshot {
  version: number;
  schedules: ScheduleRow[];
  medication_logs: LogRow[];
  patients: PatientRow[];
}

const SNAPSHOT_VERSION = 1;

export async function writeSnapshot(clerkId: string, db: SQLite.SQLiteDatabase) {
  const schedules = await db.getAllAsync<ScheduleRow>(`SELECT * FROM schedules`);
  const medication_logs = await db.getAllAsync<LogRow>(`SELECT * FROM medication_logs`);
  const patients = await db.getAllAsync<PatientRow>(`SELECT * FROM patients`);

  const snapshot: Snapshot = {
    version: SNAPSHOT_VERSION,
    schedules,
    medication_logs,
    patients,
  };

  await setDoc(doc(firestore, SNAPSHOTS_COLLECTION, clerkId), {
    ...snapshot,
    updatedAt: serverTimestamp(),
  });
}

export async function readSnapshot(clerkId: string): Promise<Snapshot | null> {
  const snap = await getDoc(doc(firestore, SNAPSHOTS_COLLECTION, clerkId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (!data || data.version !== SNAPSHOT_VERSION) return null;
  return {
    version: data.version,
    schedules: data.schedules ?? [],
    medication_logs: data.medication_logs ?? [],
    patients: data.patients ?? [],
  };
}

export async function restoreSnapshot(db: SQLite.SQLiteDatabase, snapshot: Snapshot) {
  await db.withTransactionAsync(async () => {
    for (const p of snapshot.patients) {
      await db.runAsync(
        `INSERT OR REPLACE INTO patients (id, name, image_uri, clerk_user_id, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [p.id, p.name, p.image_uri, p.clerk_user_id, p.updated_at],
      );
    }
    for (const s of snapshot.schedules) {
      await db.runAsync(
        `INSERT OR REPLACE INTO schedules
          (id, sync_id, medicine_name, type, count, whenToTake, additional, notification_id,
           stock, expiration_date, image_uri, repeat_days, start_date, end_date, patient_id, updated_at, kind)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.id, s.sync_id, s.medicine_name, s.type, s.count, s.whenToTake, s.additional,
          s.notification_id, s.stock, s.expiration_date, s.image_uri, s.repeat_days,
          s.start_date, s.end_date, s.patient_id, s.updated_at, s.kind ?? "medication",
        ],
      );
    }
    for (const l of snapshot.medication_logs) {
      await db.runAsync(
        `INSERT OR REPLACE INTO medication_logs
          (id, sync_id, medication_id, scheduled_time, log_date, timestamp, status, patient_id, updated_at, value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [l.id, l.sync_id, l.medication_id, l.scheduled_time, l.log_date, l.timestamp, l.status, l.patient_id, l.updated_at, l.value],
      );
    }
  });
}

export async function isLocalDbEmpty(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT
       (SELECT COUNT(*) FROM schedules) +
       (SELECT COUNT(*) FROM medication_logs) +
       (SELECT COUNT(*) FROM patients) AS c`,
  );
  return (row?.c ?? 0) === 0;
}
