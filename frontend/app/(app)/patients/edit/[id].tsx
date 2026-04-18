import { useToast } from "@/context/toast-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, TextInput, View } from "react-native";

export default function PatientEditScreen() {
  const { id, name, age } = useLocalSearchParams();
  const { showToast } = useToast();
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [patientName, setPatientName] = useState(name as string);
  const [patientAge, setPatientAge] = useState(age as string);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (name) setPatientName(name as string);
    if (age) setPatientAge(age as string);
  }, [name, age]);

  const updatePatient = async () => {
    if (!patientName.trim() || !id) {
      showToast("Please enter a name", "error");
      return;
    }
    setLoading(true);
    try {
      await db.runAsync(
        "UPDATE patients SET name = ?, age = ? WHERE id = ?",
        [patientName, parseInt(patientAge) || 0, id.toString()],
      );
      showToast("Patient updated successfully");
      router.back();
    } catch (error) {
      showToast("Failed to update patient", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="bg-background px-4 pt-4 h-full">
      <Stack.Screen options={{ headerShown: true, title: "Edit Patient" }} />

      <View className="flex-row items-center gap-4 p-2 mb-4">
        <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
        </Pressable>
        <Text className="text-2xl font-bold text-primary">{t("edit_patient")}</Text>
      </View>

      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("patient_name")}</Text>
        <TextInput
          value={patientName}
          onChangeText={setPatientName}
          placeholder="Enter patient name"
          placeholderTextColor="#888888"
          className="text-primary bg-white border border-primary rounded-2xl px-4 py-3 text-base"
        />
      </View>

      <View className="gap-2 px-2 mb-8">
        <Text className="text-base font-semibold text-primary">{t("age")}</Text>
        <TextInput
          value={patientAge}
          onChangeText={setPatientAge}
          placeholder="Enter age"
          placeholderTextColor="#888888"
          keyboardType="numeric"
          className="text-primary bg-white border border-primary rounded-2xl px-4 py-3 text-base"
        />
      </View>

      <View className="px-2">
        <Pressable
          className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full shadow-sm"
          onPress={updatePatient}
          disabled={loading}
        >
          <Text className="text-background text-xl font-bold">
            {loading ? "Saving..." : t("save")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
