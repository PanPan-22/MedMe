import * as SQLite from "expo-sqlite";
import { useEffect, useState } from "react";
import { Button, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type SQLiteDatabase = SQLite.SQLiteDatabase | null;
let db: SQLiteDatabase = null;

export interface Medication {
  medicine_name: string;
  count: number;
  type: string;
  whenToTake: string;
  additional: string;
}

async function openDatabase(): Promise<SQLiteDatabase> {
  try {
    db = await SQLite.openDatabaseAsync("medicines.db");
    await db.execAsync(`CREATE TABLE IF NOT EXISTS medicines (
            medicine_id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      "SELECT medicine_id FROM medicines WHERE medicine_name = ?",
      [medicineName],
    );
    return result ? true : false;
  } catch (error) {
    console.error("Error checking medicine existence:", error);
    return false;
  }
};

export const saveToDB = async (note: Medication) => {
  if (!db || (await medicineExists(note.medicine_name))) return;
  try {
    await db.runAsync(
      "INSERT INTO medicines (medicine_name, count, type, whenToTake, additional) VALUES (?, ?, ?, ?, ?)",
      [
        note.medicine_name,
        note.count,
        note.type,
        note.whenToTake,
        note.additional,
      ],
    );
    console.log("Medicine note inserted successfully");
  } catch (error) {
    console.error("Error inserting medicine note:", error);
  }
};

const StartDB = () => {
  const [notes, setNotes] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchNotes = async () => {
    if (!db) return;
    try {
      const allNotes: Medication[] = await db.getAllAsync(
        "SELECT * FROM medicines",
      );
      setNotes(allNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
    }
  };

  const insertMedicineNote = async (note: Medication) => {
    if (!db || (await medicineExists(note.medicine_name))) return;
    try {
      await db.runAsync(
        "INSERT INTO medicines (medicine_name, count, type, whenToTake, additional) VALUES (?, ?, ?, ?, ?)",
        [
          note.medicine_name,
          note.count,
          note.type,
          note.whenToTake,
          note.additional,
        ],
      );
      await fetchNotes();
      console.log("Medicine note inserted successfully");
    } catch (error) {
      console.error("Error inserting medicine note:", error);
    }
  };

  const clearDatabase = async () => {
    if (!db) return;
    try {
      await db.runAsync("DELETE FROM medicines");
      await fetchNotes();
      console.log("Database cleared successfully");
    } catch (error) {
      console.error("Error clearing database:", error);
    }
  };

  useEffect(() => {
    openDatabase()
      .then(() => {
        fetchNotes();
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView>
      <Text>Medicine Notes</Text>
      <View style={{ marginTop: 20 }}>
        <Button
          title="Clear Database"
          onPress={clearDatabase}
          color="#ff2400"
        />
      </View>
      {loading ? (
        <Text>Loading...</Text>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.medicine_name}
          renderItem={({ item }) => (
            <View
              style={{
                padding: 10,
                borderBottomWidth: 1,
                borderBottomColor: "#ccc",
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "bold" }}>
                {item.medicine_name}
              </Text>
              <Text>Count: {item.count}</Text>
              <Text>Type: {item.type}</Text>
              <Text>When to Take: {item.whenToTake}</Text>
              <Text>Additional: {item.additional}</Text>
            </View>
          )}
          ListEmptyComponent={<Text>No medicines found.</Text>}
        />
      )}
    </SafeAreaView>
  );
};

export { StartDB };
