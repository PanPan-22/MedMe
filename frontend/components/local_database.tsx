import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';

type SQLiteDatabase = SQLite.SQLiteDatabase | null;
let db: SQLiteDatabase = null;

interface Note {
    medicine_name: string;
    count: number;
    type: string;
    whenToTake: string;
    additional: string;
}
const getRandomElement = (arr: any[]) => arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
const sampleData = [
    {
        medicine_name: 'Aspirin',
        count: 500,
        type: 'Tablet',
        whenToTake: '08:00',
        additional: 'With water'
    },
    {
        medicine_name: 'Amoxicillin',
        count: 250,
        type: 'Capsule',
        whenToTake: '08:00, 14:00, 20:00',
        additional: 'Before meals'
    },
    {
        medicine_name: 'Metformin',
        count: 1000,
        type: 'Tablet',
        whenToTake: '08:00, 20:00',
        additional: 'With meals'
    },
    {
        medicine_name: 'Lisinopril',
        count: 30,
        type: 'Tablet',
        whenToTake: '08:00',
        additional: 'In the morning'
    },
    {
        medicine_name: 'Omeprazole',
        count: 28,
        type: 'Capsule',
        whenToTake: '07:00',
        additional: 'Before breakfast'
    },
    {
        medicine_name: 'Paracetamol',
        count: 100,
        type: 'Tablet',
        whenToTake: '06:00, 12:00, 18:00, 00:00',
        additional: 'As needed for pain'
    },
    {
        medicine_name: 'Cough Syrup',
        count: 200,
        type: 'Liquid',
        whenToTake: '09:00, 21:00',
        additional: '10ml per dose'
    },
    {
        medicine_name: 'Vitamin D3',
        count: 60,
        type: 'Softgel',
        whenToTake: '08:30',
        additional: 'With breakfast'
    },
    {
        medicine_name: 'Ibuprofen',
        count: 50,
        type: 'Tablet',
        whenToTake: '08:00, 14:00, 20:00',
        additional: 'With food'
    },
    {
        medicine_name: 'Loratadine',
        count: 30,
        type: 'Tablet',
        whenToTake: '10:00',
        additional: 'Allergy relief'
    }
];

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
        <View style={{ marginTop: 50 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Medicine Notes</Text>
            <View style={{ marginTop: 20 }}>
                <Button title="Test Insert" onPress={() => {
                    // Call the function to insert a new medicine note
                    insertMedicineNote(getRandomElement(sampleData) as Note);
                }} />

            </View>
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
                            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{item.medicine_name}</Text>
                            <Text>Count: {item.count}</Text>
                            <Text>Type: {item.type}</Text>
                            <Text>When to Take: {item.whenToTake}</Text>
                            <Text>Additional: {item.additional}</Text>
                        </View>
                    )}
                    ListEmptyComponent={<Text>No medicines found.</Text>}
                />)}
        </View>
    )
}




export { StartDB };

