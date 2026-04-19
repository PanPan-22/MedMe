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

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS medication_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_id TEXT UNIQUE,
        medication_id INTEGER NOT NULL,
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
      CREATE TABLE IF NOT EXISTS user_profile (
        clerk_id TEXT PRIMARY KEY NOT NULL,
        first_name TEXT,
        last_name TEXT,
        role TEXT
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
      `ALTER TABLE medication_logs ADD COLUMN sync_id TEXT`,
      `ALTER TABLE medication_logs ADD COLUMN updated_at TEXT`,
      `ALTER TABLE medication_logs ADD COLUMN patient_id INTEGER`,
      `ALTER TABLE medication_logs ADD COLUMN value TEXT`,
    ];
    for (const sql of migrations) {
      try { await db.execAsync(sql); } catch { /* already exists */ }
    }

    const dedup = [
      `DELETE FROM schedules WHERE sync_id IS NOT NULL AND id NOT IN (SELECT MIN(id) FROM schedules WHERE sync_id IS NOT NULL GROUP BY sync_id)`,
      `DELETE FROM medication_logs WHERE sync_id IS NOT NULL AND id NOT IN (SELECT MIN(id) FROM medication_logs WHERE sync_id IS NOT NULL GROUP BY sync_id)`,
      `DELETE FROM patients WHERE clerk_user_id IS NOT NULL AND id NOT IN (SELECT MIN(id) FROM patients WHERE clerk_user_id IS NOT NULL GROUP BY clerk_user_id)`,
    ];
    for (const sql of dedup) {
      try { await db.execAsync(sql); } catch (e) { console.warn("dedup failed", e); }
    }

    const dropOldIndexes = [
      `DROP INDEX IF EXISTS idx_schedules_sync_id`,
      `DROP INDEX IF EXISTS idx_medication_logs_sync_id`,
      `DROP INDEX IF EXISTS idx_patients_clerk_user_id`,
    ];
    for (const sql of dropOldIndexes) {
      try { await db.execAsync(sql); } catch { /* ignore */ }
    }

    const indexes = [
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_sync_id ON schedules(sync_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_medication_logs_sync_id ON medication_logs(sync_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_clerk_user_id ON patients(clerk_user_id)`,
    ];
    for (const sql of indexes) {
      try { await db.execAsync(sql); } catch (e) { console.warn("index failed", e); }
    }

    console.log("Database initialized");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}
