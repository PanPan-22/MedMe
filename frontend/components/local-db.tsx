import * as SQLite from "expo-sqlite";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";

type SQLiteDatabase = SQLite.SQLiteDatabase | null;
let db: SQLiteDatabase = null;

export interface Medication {
  id: number;
  medicine_name: string;
  count: number;
  type: string;
  whenToTake: string;
  additional: string;
}

async function openDatabase(): Promise<SQLiteDatabase> {
  try {
    db = useSQLiteContext();
    // await db.execAsync('DROP TABLE IF EXISTS schedules;'); // DANGEROUS!! USE WHEN YOU WANT TO UPDATE THE SCHEMA AND DON'T CARE ABOUT LOSING DATA!
    await db.execAsync(`CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_name TEXT NOT NULL,
            count INTEGER,
            type TEXT,
            whenToTake TEXT,
            additional TEXT
        )`);
    console.log("Database opened and table created successfully");
    return db;
  } catch (error) {
    console.error("Error opening database:", error);
    return null;
  }
}

const medicineExists = async (medicineName: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const result = await db.getFirstAsync(
      "SELECT medicine_id FROM schedules WHERE medicine_name = ?",
      [medicineName],
    );
    return result ? true : false;
  } catch (error) {
    console.error("Error checking medicine existence:", error);
    return false;
  }
};

export const Length = async (db: any) => {
  if (!db) return 0;
  try {
    const result = await db.getAllAsync('SELECT * FROM schedules')
    console.log("Current number of schedules in database:", result.length);
    return result.length;
  }
  catch (error) {
    console.error("Error getting medicine count:", error);
    return 0;
  }
}

export async function saveToDB(db: any, note: Medication) : Promise<boolean> {
  if (!db) {
    console.log("Medicine already exists or database not initialized");
    return false;
  } else if (note.medicine_name.trim() === "") {
    console.log("Medicine name is empty");
    return false;
  }
  
  note.id = await Length(db) + 1; // This is a simple way to generate an ID, but it can lead to issues if records are deleted. Consider using AUTOINCREMENT in the database schema for a more robust solution.
  console.log("Inserting medicine note:", note);
  try {
    await db.runAsync(
      "INSERT INTO schedules (id, medicine_name, count, type, whenToTake, additional) VALUES (?, ?, ?, ?, ?, ?)",
      [
        note.id,
        note.medicine_name,
        note.count,
        note.type,
        note.whenToTake,
        note.additional,
      ],
    );
    console.log("Medicine note inserted successfully");
    return true;
  } catch (error) {
    console.error("Error inserting medicine note:", error);
    return false;
  }
};

export const clearDatabase = async (db: SQLiteDatabase) => {
  if (!db) return;
  try {
    await db.runAsync("DELETE FROM schedules");
    console.log("Database cleared successfully");
  } catch (error) {
    console.error("Error clearing database:", error);
  }
};

const StartDB = () => {
  const [notes, setNotes] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchNotes = async () => {
    if (!db) return;
    try {
      const allNotes: Medication[] = await db.getAllAsync(
        "SELECT * FROM schedules",
      );
      // console.log("Fetched notes from database:", allNotes);
      setNotes(allNotes);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching notes:", error);
    }
  };

  useEffect(() => {
    openDatabase()
      .then(() => {
        fetchNotes();
        console.log("Dokkan notes:", notes);
      })
      .catch(() => setLoading(false));
  }, []);

  return {notes, loading};
};

export { StartDB };

