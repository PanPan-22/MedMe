import * as SQLite from "expo-sqlite";

export async function initializeDatabase(db: SQLite.SQLiteDatabase) {
  try {
    // await db.execAsync(`DROP TABLE IF EXISTS schedules;`); // DANGEROUS!! USE WHEN YOU WANT TO UPDATE THE SCHEMA AND DON'T CARE ABOUT LOSING DATA!
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY NOT NULL, 
      medicine_name TEXT NOT NULL, 
      type TEXT,
      count INTEGER, 
      whenToTake TEXT, 
      additional TEXT,
      notification_id TEXT -- Add this!
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

    console.log("Database 'schedules' initialized");
    console.log(await db.getAllAsync("PRAGMA table_info(schedules);"));
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}