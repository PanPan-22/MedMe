import { useToast } from '@/context/toast-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@react-navigation/native';
import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { t } from 'i18next';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Patient } from '../patient-list';

export default function PatientInfo() {
    const { id, name, age } = useLocalSearchParams();
    const { colors } = useTheme();
    const db = useSQLiteContext();
    const [patient, setPatient] = useState<Patient>();
    const { showToast } = useToast();

    const fetchPatient = async () => {
        try {
            const result = await db.getFirstAsync(
                "SELECT * FROM patients WHERE id = ?",
                [id.toString()],
            );
            setPatient(result as Patient);
        } catch (error) {
            console.error("Skill issues", error);
        }
    };

    const removePatient = async () => {
        try {
            await db.runAsync("DELETE FROM patients WHERE id = ?", [id.toString()]);
            showToast('Patient data removed successfully.');
            router.back();
        } catch (haha) {
            console.error('What happened!?', haha);
            showToast('Failed to remove data!!', 'error')
        }
    }

    const alertBeforeRemove = () => {
        Alert.alert(
            'Remove Patient', 'Are you sure??',
            [
                {
                    text: 'No',
                    style: 'cancel',
                },
                {
                    text: 'Yes',
                    onPress: removePatient,
                    style: 'destructive'
                }
            ]
        )
    }

    useFocusEffect(
        useCallback(() => {
            fetchPatient();
        }, []),
    );
    return (
        <View>
            <Stack.Screen options={{ headerShown: true, title: "Edit Patient" }} />
            <View className="flex-row items-center gap-4 mb-6">
                <Pressable onPress={() => router.back()}>
                    <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
                </Pressable>
                <Text className="text-2xl text-primary">{t("Patient Info")}</Text>
            </View>
            <Text className="text-2xl text-primary">
                ID: {patient?.id}{`\n`}
                Name: {patient?.name}{`\n`}
                Age: {patient?.age}</Text>
            <Link href={{
                pathname: '/patient-edit/[id]',
                params: {
                    id: id.toString(), name: name, age: age.toString()
                }
            }} asChild>
                <Pressable className="bg-primary rounded-xl p-4 w-30">
                    <Text className="text-white">Edit Info</Text>
                </Pressable>
            </Link>
            <View>
                <Pressable className="bg-red-600 rounded-xl p-4 w-30" onPress={alertBeforeRemove}>
                    <Text className="text-white">Delete</Text>
                </Pressable>
            </View>

        </View>
    )
}