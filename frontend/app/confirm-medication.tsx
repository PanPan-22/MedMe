import { saveToDB as addMedicine } from "@/components/local-db";
import { useToast } from "@/context/toast-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";

export default function ConfirmMedicationScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();

  // 1. Get the data passed from the scanner
  const params = useLocalSearchParams();

  // 2. Initialize state with the AI-parsed values
  const [name, setName] = useState((params.medicine_name as string) || "");
  const [amount, setAmount] = useState((params.count as string) || "");
  const [note, setNote] = useState((params.additional as string) || "");
  const [type, setType] = useState((params.type as string) || "Pill");

  // Convert whenToTake string back into an array for the chips
  const [times, setTimes] = useState<string[]>([]);

  const db = useSQLiteContext();
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);

  // 3. Handle incoming 'whenToTake' string or array
  useEffect(() => {
    if (params.whenToTake) {
      // If it comes as a comma-separated string from AI
      const timeArray = (params.whenToTake as string)
        .split(",")
        .map((t) => t.trim());
      setTimes(timeArray.sort());
    }
  }, [params.whenToTake]);

  const handleConfirm = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const newTime = `${hours}:${minutes}`;

    if (!times.includes(newTime)) {
      setTimes([...times, newTime].sort());
    }
    setDatePickerVisibility(false);
  };

  const removeTime = (indexToRemove: number) => {
    setTimes(times.filter((_, index) => index !== indexToRemove));
  };

  return (
    <ScrollView className="bg-background px-4 pt-4 h-full">
      <Stack.Screen
        options={{ headerShown: true, title: "Confirm Medication" }}
      />

      <View className="flex-row items-center justify-between p-2 mb-2 w-full">
        <View className="flex-row items-center gap-4">
          <Pressable
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
          </Pressable>
          <Text className="text-2xl font-bold text-primary">
            Review Details
          </Text>
        </View>
      </View>

      {/* Medication Name */}
      <View className="gap-2 p-2 mb-4 w-full">
        <Text className="text-xl font-semibold text-primary">
          {t("medication_name")}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          className="text-primary bg-white border border-primary rounded-2xl px-4 h-14 text-lg"
        />
      </View>

      {/* Amount */}
      <View className="gap-2 p-2 mb-4 w-full">
        <Text className="text-xl font-semibold text-primary">
          {t("amount")}
        </Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          className="text-primary bg-white border border-primary rounded-2xl px-4 h-14 text-lg"
        />
      </View>

      {/* Schedule / Times */}
      <View className="gap-2 p-2 mb-4 w-full">
        <Text className="text-xl font-semibold text-primary">
          {t("schedule")}
        </Text>
        <View className="flex-row flex-wrap gap-2 items-center">
          {times.map((time, index) => (
            <View
              key={index}
              className="flex-row items-center bg-primary/10 border border-primary rounded-full px-4 py-2"
            >
              <Text className="text-primary font-bold mr-2 text-lg">
                {time}
              </Text>
              <Pressable onPress={() => removeTime(index)}>
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </Pressable>
            </View>
          ))}
          <Pressable
            className="flex-row items-center bg-white border border-dashed border-primary rounded-full px-5 py-2"
            onPress={() => setDatePickerVisibility(true)}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
            <Text className="text-primary font-medium ml-1 text-lg">
              {t("add_time")}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Notes */}
      <View className="gap-2 p-2 mb-4 w-full">
        <Text className="text-xl font-semibold text-primary">
          {t("additional_notes")}
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          textAlignVertical="top"
          className="text-primary text-lg h-32 bg-white border border-primary rounded-2xl p-4"
        />
      </View>

      {/* Save Button */}
      <View className="items-center mt-4 mb-10">
        <Pressable
          className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-5 w-full shadow-lg"
          onPress={async () => {
            const success = await addMedicine(db, {
              id: 0,
              medicine_name: name.trim(),
              type: type, // Keep the AI-identified type (Pill, Syrup, etc.)
              count: parseInt(amount) || 0,
              whenToTake: times.join(","),
              additional: note.trim(),
            });

            if (success) {
              showToast("Medication saved successfully!");
              router.dismiss(2);
            } else {
              showToast("Failed to save medication", "error");
            }
          }}
        >
          <Text className="text-white text-2xl font-bold">Save Medication</Text>
        </Pressable>
      </View>

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="time"
        onConfirm={handleConfirm}
        onCancel={() => setDatePickerVisibility(false)}
      />
    </ScrollView>
  );
}
