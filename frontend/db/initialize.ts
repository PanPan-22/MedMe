import * as SQLite from "expo-sqlite";

export async function initializeDatabase(db: SQLite.SQLiteDatabase) {
  try {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_id TEXT UNIQUE,
        medicine_name TEXT NOT NULL,
        type TEXT,
        count INTEGER,
        whenToTake TEXT,
        additional TEXT,
        notification_id TEXT,
        stock INTEGER DEFAULT 0,
        expiration_date TEXT,
        image_uri TEXT,
        repeat_days TEXT DEFAULT 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',
        start_date TEXT,
        end_date TEXT,
        patient_id INTEGER,
        updated_at TEXT,
        kind TEXT DEFAULT 'medication'
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        image_uri TEXT,
        clerk_user_id TEXT UNIQUE,
        updated_at TEXT
      );
    `);

    // Idempotent rename migrations — run before creating the logs table so fresh
    // installs skip silently, and existing installs upgrade in place.
    try { await db.execAsync(`ALTER TABLE medication_logs RENAME TO logs`); } catch { /* already renamed or fresh install */ }
    try { await db.execAsync(`ALTER TABLE logs RENAME COLUMN medication_id TO schedule_id`); } catch { /* already renamed */ }

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_id TEXT UNIQUE,
        schedule_id INTEGER NOT NULL,
        scheduled_time TEXT NOT NULL,
        log_date TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL,
        patient_id INTEGER,
        updated_at TEXT,
        value TEXT
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS patient_links (
        patient_clerk_id TEXT PRIMARY KEY,
        caretaker_clerk_id TEXT NOT NULL,
        linked_at TEXT NOT NULL
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        target_clerk_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        source_updated_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        last_error TEXT
      );
    `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS inbox_processed (
        event_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL
      );
    `);

    const migrations = [
      `DROP TABLE IF EXISTS user_profile`,
      `ALTER TABLE patients ADD COLUMN image_uri TEXT`,
      `ALTER TABLE patients ADD COLUMN clerk_user_id TEXT`,
      `ALTER TABLE patients ADD COLUMN updated_at TEXT`,
      `ALTER TABLE patients DROP COLUMN age`,
      `ALTER TABLE schedules ADD COLUMN sync_id TEXT`,
      `ALTER TABLE schedules ADD COLUMN updated_at TEXT`,
      `ALTER TABLE schedules ADD COLUMN patient_id INTEGER`,
      `ALTER TABLE schedules ADD COLUMN additional TEXT`,
      `ALTER TABLE schedules ADD COLUMN notification_id TEXT`,
      `ALTER TABLE schedules ADD COLUMN stock INTEGER DEFAULT 0`,
      `ALTER TABLE schedules ADD COLUMN expiration_date TEXT`,
      `ALTER TABLE schedules ADD COLUMN image_uri TEXT`,
      `ALTER TABLE schedules ADD COLUMN repeat_days TEXT DEFAULT 'Mon,Tue,Wed,Thu,Fri,Sat,Sun'`,
      `ALTER TABLE schedules ADD COLUMN start_date TEXT`,
      `ALTER TABLE schedules ADD COLUMN end_date TEXT`,
      `ALTER TABLE schedules ADD COLUMN kind TEXT DEFAULT 'medication'`,
      `ALTER TABLE logs ADD COLUMN sync_id TEXT`,
      `ALTER TABLE logs ADD COLUMN updated_at TEXT`,
      `ALTER TABLE logs ADD COLUMN patient_id INTEGER`,
      `ALTER TABLE logs ADD COLUMN value TEXT`,
    ];
    for (const sql of migrations) {
      try { await db.execAsync(sql); } catch { /* already exists */ }
    }

    // Collect notification_ids on schedule rows about to be deleted by dedup,
    // so we (or useNotificationReconcile) can cancel them. We just clear the
    // notification_id column on the soon-to-be-deleted rows; the keeper row's
    // notification_id stays. Reconcile then sees mismatched OS notifications
    // not claimed by any DB row and cancels them.
    try {
      await db.execAsync(`
        UPDATE schedules SET notification_id = NULL
        WHERE sync_id IS NOT NULL
          AND id NOT IN (SELECT MIN(id) FROM schedules WHERE sync_id IS NOT NULL GROUP BY sync_id)
      `);
    } catch (e) { console.warn("dedup notif clear failed", e); }

    const dedup = [
      `DELETE FROM schedules WHERE sync_id IS NOT NULL AND id NOT IN (SELECT MIN(id) FROM schedules WHERE sync_id IS NOT NULL GROUP BY sync_id)`,
      `DELETE FROM logs WHERE sync_id IS NOT NULL AND id NOT IN (SELECT MIN(id) FROM logs WHERE sync_id IS NOT NULL GROUP BY sync_id)`,
      `DELETE FROM patients WHERE clerk_user_id IS NOT NULL AND id NOT IN (SELECT MIN(id) FROM patients WHERE clerk_user_id IS NOT NULL GROUP BY clerk_user_id)`,
    ];
    for (const sql of dedup) {
      try { await db.execAsync(sql); } catch (e) { console.warn("dedup failed", e); }
    }

    const dropOldIndexes = [
      `DROP INDEX IF EXISTS idx_schedules_sync_id`,
      `DROP INDEX IF EXISTS idx_medication_logs_sync_id`,
      `DROP INDEX IF EXISTS idx_medication_logs_medication_id`,
      `DROP INDEX IF EXISTS idx_medication_logs_patient_log_date`,
      `DROP INDEX IF EXISTS idx_patients_clerk_user_id`,
    ];
    for (const sql of dropOldIndexes) {
      try { await db.execAsync(sql); } catch { /* ignore */ }
    }

    const indexes = [
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_sync_id ON schedules(sync_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_sync_id ON logs(sync_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_clerk_user_id ON patients(clerk_user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_schedules_patient_id ON schedules(patient_id)`,
      `CREATE INDEX IF NOT EXISTS idx_logs_schedule_id ON logs(schedule_id)`,
      `CREATE INDEX IF NOT EXISTS idx_logs_patient_log_date ON logs(patient_id, log_date)`,
    ];
    for (const sql of indexes) {
      try { await db.execAsync(sql); } catch (e) { console.warn("index failed", e); }
    }

    console.log("Database initialized");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}
