// app/patient-edit/[id].tsx
import { useToast } from '@/context/toast-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@react-navigation/native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';

export default function PatientEditScreen() {
    const { id, name, age } = useLocalSearchParams();
    const { showToast } = useToast();
    const db = useSQLiteContext();
    const { t } = useTranslation();
    const { colors } = useTheme();
    const [patientName, setPatientName] = useState(name as string);
    const [patientAge, setPatientAge] = useState(age as string);
    const [loading, setLoading] = useState(false);

    console.log(patientName);

    const updatePatient = async () => {
        if (!patientName.trim() || !id) {
            alert('Please enter a name');
            return;
        }
        
        setLoading(true);
        try {
            await db.runAsync(
                'UPDATE patients SET name = ?, age = ? WHERE id = ?',
                [patientName, parseInt(patientAge) || 0, id.toString()]
            );
            showToast('Patient updated successfully');
            router.back();
        } catch (error) {
            console.error('Update error:', error);
            showToast('Failed to update patient',"error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (name) setPatientName(name as string);
        if (age) setPatientAge(age as string);
    }, [name,age])

    return (
        <View style={{ flex: 1, padding: 16 }}>
            <Stack.Screen options={{ headerShown: true, title: "Edit Patient" }} />
            
            <View className="flex-row items-center gap-4 mb-6">
                <Pressable onPress={() => router.back()}>
                    <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
                </Pressable>
                <Text className="text-2xl text-primary">{t("Edit Patient")}</Text>
            </View>

            <View className="mb-4">
                <Text className="text-lg font-semibold mb-2">Patient Name</Text>
                <TextInput
                    value={patientName}
                    onChangeText={setPatientName}
                    placeholder="Enter patient name"
                    style={{
                        borderWidth: 1,
                        borderColor: '#ccc',
                        padding: 10,
                        borderRadius: 5
                    }}
                />
            </View>

            <View className="mb-6">
                <Text className="text-lg font-semibold mb-2">Age</Text>
                <TextInput
                    value={patientAge}
                    onChangeText={setPatientAge}
                    placeholder="Enter age"
                    keyboardType="numeric"
                    style={{
                        borderWidth: 1,
                        borderColor: '#ccc',
                        padding: 10,
                        borderRadius: 5
                    }}
                />
            </View>

            <Pressable
                className="bg-primary rounded-xl p-4"
                onPress={updatePatient}
                disabled={loading}
            >
                <Text className="text-2xl text-white text-center">
                    {loading ? 'Saving...' : t("Save")}
                </Text>
            </Pressable>
        </View>
    );
}