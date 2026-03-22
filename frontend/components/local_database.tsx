import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from './themed-text';

type SQLiteDatabase = SQLite.SQLiteDatabase | null;
let db: SQLiteDatabase = null;

export interface Note {
    medicine_name: string;
    count: number;
    type: string;
    whenToTake: string;
    additional: string;
}

async function openDatabase(): Promise<SQLiteDatabase> {
    try {
        db = await SQLite.openDatabaseAsync('medicines.db');
        await db.execAsync(`CREATE TABLE IF NOT EXISTS medicines (
            medicine_id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_name TEXT NOT NULL,
            count INTEGER,
            type TEXT,
            whenToTake TEXT,
            additional TEXT
        )`);
        console.log('Database opened and table created successfully');
        return db;
    }
    catch (error) {
        console.error('Error opening database:', error);
        return null;
    }
}

const medicineExists = async (medicineName: string): Promise<boolean> => {
    if (!db) return false;
    try {
        const result = await db.getFirstAsync('SELECT medicine_id FROM medicines WHERE medicine_name = ?', [medicineName]);
        return result ? true : false;
    }
    catch (error) {
        console.error('Error checking medicine existence:', error);
        return false;
    }
}

export const saveToDB = async (note: Note) => {
    if (!db || await medicineExists(note.medicine_name)) return;
    try {
        await db.runAsync(
            'INSERT INTO medicines (medicine_name, count, type, whenToTake, additional) VALUES (?, ?, ?, ?, ?)',
            [note.medicine_name, note.count, note.type, note.whenToTake, note.additional]
        );
        console.log('Medicine note inserted successfully');
    }
    catch (error) {
        console.error('Error inserting medicine note:', error);
    }
}

const StartDB = () => {
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const fetchNotes = async () => {
        if (!db) return;
        try {
            const allNotes: Note[] = await db.getAllAsync('SELECT * FROM medicines');
            setNotes(allNotes);
        }
        catch (error) {
            console.error('Error fetching notes:', error);
        }
    };

    const insertMedicineNote = async (note: Note) => {
        if (!db || await medicineExists(note.medicine_name)) return;
        try {
            await db.runAsync(
                'INSERT INTO medicines (medicine_name, count, type, whenToTake, additional) VALUES (?, ?, ?, ?, ?)',
                [note.medicine_name, note.count, note.type, note.whenToTake, note.additional]
            );
            await fetchNotes();
            console.log('Medicine note inserted successfully');
        }
        catch (error) {
            console.error('Error inserting medicine note:', error);
        }
    }

    const clearDatabase = async () => {
        if (!db) return;
        try {
            await db.runAsync('DELETE FROM medicines');
            await fetchNotes();
            console.log('Database cleared successfully');
        }
        catch (error) {
            console.error('Error clearing database:', error);
        }
    }

    useEffect(() => {
        openDatabase().then(() => {
            fetchNotes();
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    return (
        <SafeAreaView>
            <ThemedText style={{ fontSize: 20, fontWeight: 'bold' }}>Medicine Notes</ThemedText>
            <View style={{ marginTop: 20 }}>
                <Button title="Clear Database" onPress={clearDatabase} color="#ff2400"/>
            </View>
            {loading ? (
                <Text>Loading...</Text>
            ) : (
                <FlatList
                    data={notes}
                    keyExtractor={(item) => item.medicine_name}
                    renderItem={({ item }) => (
                        <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#ccc' }}>
                            <ThemedText style={{ fontSize: 18, fontWeight: 'bold' }}>{item.medicine_name}</ThemedText>
                            <ThemedText>Count: {item.count}</ThemedText>
                            <ThemedText>Type: {item.type}</ThemedText>
                            <ThemedText>When to Take: {item.whenToTake}</ThemedText>
                            <ThemedText>Additional: {item.additional}</ThemedText>
                        </View>
                    )}
                    ListEmptyComponent={<Text>No medicines found.</Text>}
                />)}
        </SafeAreaView>
    )
}




export { StartDB };

