import * as SQLite from "expo-sqlite";

export async function initializeDatabase(db: SQLite.SQLiteDatabase) {
  try {
    await db.execAsync(`DROP TABLE IF EXISTS medication_logs;`);
    await db.execAsync(`DROP TABLE IF EXISTS schedules;`);
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      patient_id INTEGER
    );
    `);

    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER NOT NULL
      );
      `);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS medication_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        medication_id INTEGER NOT NULL,
        scheduled_time TEXT NOT NULL,
        log_date TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL,
        patient_id INTEGER
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

    console.log("Database 'schedules' initialized");
    console.log(await db.getAllAsync("PRAGMA table_info(schedules);"));
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}