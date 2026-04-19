import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { Link, Stack, router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";

export interface Patient {
    id: number;
    name: string;
    age: number;
}
export default function PatientScreen() {
    const db = useSQLiteContext();
    const { colors } = useTheme();
    const [text, setText] = useState('');
    const [results, setResults] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(false);
    const { t } = useTranslation();

    useFocusEffect(
        useCallback(() => {
            fetchPatients();
        }, []),
    );

    const searchPatient = async (query: string) => {
        if (!query.trim()) {
            fetchPatients();
            return;
        }
        setLoading(true);
        try {

            const foundPatients = await db.getAllAsync<Patient>(`SELECT * FROM patients WHERE name LIKE ?`, [`%${query}%`])
            setResults(foundPatients);
        }
        catch (e) {
            console.error("Search error:", e);
        }
        finally {
            setLoading(false);
        }
    }
    const fetchPatients = async () => {
        setLoading(true)
        try {
            const patience = await db.getAllAsync<Patient>('SELECT * FROM patients');
            setResults(patience);
        }
        catch (e) {
            console.log(`Kung Fu fighting ${e}`)
        }
        finally {
            setLoading(false);
        }
    }

    const handleSearch = (query: string) => {
        setText(query);
        searchPatient(query);
    }

    return (
        <View style={{ flex: 1, padding: 16 }}>
            <Stack.Screen options={{ headerShown: true, title: "Patient List" }} />
            <View className="flex-row items-center justify-between p-2 mb-2 w-full">
                <View className="flex-row items-center gap-4">
                    <Pressable onPress={() => router.back()}>
                        <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
                    </Pressable>
                    <Text className="text-2xl text-primary">{t("Patient List")}</Text>
                </View>
                <Link href="/patient-add" push asChild>
                    <Pressable className="flex-row items-center justify-center">
                        <Ionicons
                            name="add-circle-outline"
                            size={32}
                            color={colors.text}
                        />
                    </Pressable>
                </Link>
            </View>

            <TextInput
                value={text}
                onChangeText={handleSearch}
                placeholder="Search patients..."
                style={{
                    borderWidth: 1,
                    borderColor: '#ccc',
                    padding: 10,
                    marginBottom: 10,
                    borderRadius: 5
                }}
            />
            {loading && (<View>
                <Text>We can be bees.</Text>
            </View>)}
            <FlatList
                data={results}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <View style={{
                        padding: 10,
                        marginBottom: 8,
                        borderRadius: 5,
                        borderColor: '#000000',
                        borderWidth: 2
                    }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold' }}>
                            {item.name}
                        </Text>
                        <Text>Age: {item.age}</Text>
                        <View className="mt-8">
                            <Link href={{
                                pathname: '/patient-info/[id]',
                                params: {
                                    id: item.id, name: item.name, age: item.age.toString()
                                }
                            }} push asChild>
                                <Pressable className="bg-primary rounded-xl p-4 w-30">
                                    <Text className="text-white">{t("View Info")}</Text>
                                </Pressable>
                            </Link>
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    text.trim() ? (
                        <Text style={{ textAlign: 'center', marginTop: 20, color: '#999' }}>
                            No patients found
                        </Text>
                    ) : null
                }
            />
        </View>
    );
}
