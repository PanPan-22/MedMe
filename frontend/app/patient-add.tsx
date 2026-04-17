import { useToast } from "@/context/toast-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";

export default function AddPatient() {
    const db = useSQLiteContext();
    const [name, setName] = useState("");
    const [age, setAge] = useState("");
    const { showToast } = useToast();
    const { colors } = useTheme();
    const { t } = useTranslation();

    const addPatient = async (name: string, age: number) => {
        try {
            await db.runAsync("INSERT INTO patients (name, age) VALUES (?, ?)", [name, age],);
            console.log("Medicine note inserted successfully");
            return true;
        } catch (error) {
            console.error("Error inserting medicine note:", error);
            return false;
        }
    }

    return (
        <View>
            <View className="flex-row items-center justify-between p-2 mb-2 w-full">
                <View className="flex-row items-center gap-4">
                    <Pressable onPress={() => router.back()}>
                        <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
                    </Pressable>
                    <Text className="text-2xl text-primary">Go back</Text>
                </View>
            </View>
            <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
                <Text className="text-xl text-primary">What's the name?</Text>
                <TextInput
                    value={name}
                    onChangeText={setName}
                    className="text-primary bg-white border border-primary rounded-2xl px-3 text-base h-12"
                />
            </View>
            <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
                <Text className="text-xl text-primary">How about age?</Text>
                <TextInput
                    value={age}
                    onChangeText={setAge}
                    className="text-primary bg-white border border-primary rounded-2xl px-3 text-base h-12"
                    keyboardType="numeric"
                />
            </View>

            <View className="items-center mt-8">
                <Pressable
                    className="items-center justify-center bg-primary rounded-xl p-4 w-60"
                    onPress={async () => {
                        const success = await addPatient(name, parseInt(age));
                        if (success) {
                            showToast(`Welcome, ${name}!`);
                            router.back();
                        } else {
                            showToast("Failed to register a patient: ", "error");
                        }
                    }}
                >
                    <Text className="text-2xl text-white">{t("save")}</Text>
                </Pressable>
            </View>
        </View>
    )

}