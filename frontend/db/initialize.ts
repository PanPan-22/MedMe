import * as SQLite from "expo-sqlite";

export async function initializeDatabase(db: SQLite.SQLiteDatabase) {
  try {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS schedule (
      id INTEGER PRIMARY KEY NOT NULL, 
      name TEXT NOT NULL, 
      amount INTEGER, 
      time TEXT, 
      note TEXT,
      notification_id TEXT -- Add this!
    );
    `);
    console.log("Database initialized");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}
