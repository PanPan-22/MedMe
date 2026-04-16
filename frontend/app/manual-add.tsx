import { saveToDB as addMedicine } from "@/components/local-db";
import { useToast } from "@/context/toast-context";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";

export default function ManaualAddScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  // const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  // const [meds, setMeds] = useState<Medication[]>([]);
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  // I need to make a list of times.
  const [times, setTimes] = useState<string[]>([]);

  const db = useSQLiteContext();

  const handleConfirm = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const newTime = `${hours}:${minutes}`;

    // Prevent duplicates and sort
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
      <Stack.Screen options={{ headerShown: true, title: "Manual Add" }} />
      <View className="flex-row items-center justify-between p-2 mb-2 w-full">
        <View className="flex-row items-center gap-4">
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
          </Pressable>
          <Text className="text-2xl text-primary">{t("fill_field")}</Text>
        </View>
      </View>
      <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
        <Text className="text-xl text-primary">{t("medication_name")}</Text>
        <TextInput
          value={name}
          onChangeText={(newName) => setName(newName)}
          keyboardType="default"
          placeholder="eg. Aspirin"
          placeholderTextColor="#888888"
          className="text-primary bg-white border border-primary rounded-2xl px-3 text-base h-12"
        />
      </View>
      <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
        <Text className="text-xl text-primary">{t("amount")}</Text>
        <TextInput
          value={amount}
          onChangeText={(newAmount) => setAmount(newAmount)}
          keyboardType="numeric"
          placeholder="eg. 1"
          placeholderTextColor="#888888"
          className="text-primary bg-white border border-primary rounded-2xl px-3 text-base h-12"
        />
      </View>
      <View className="gap-2 p-2 mb-2 w-full">
        <Text className="text-xl text-primary">{t("schedule")}</Text>

        <View className="flex-row flex-wrap gap-2 items-center">
          {times.map((t, index) => (
            <View
              key={t}
              className="flex-row items-center bg-primary/10 border border-primary rounded-full px-3 py-1.5"
            >
              <Text className="text-primary font-bold mr-2">{t}</Text>
              <Pressable onPress={() => removeTime(index)}>
                {/* To get specific colors for Icons, use hex or theme variable */}
                <Ionicons name="close-circle" size={20} color="#ef4444" />
              </Pressable>
            </View>
          ))}

          {/* Smaller, inline "Add" button */}
          <Pressable
            className="flex-row items-center bg-white border border-dashed border-primary rounded-full px-4 py-1.5"
            onPress={() => setDatePickerVisibility(true)}
          >
            <Ionicons name="add" size={18} color={colors.text} />
            <Text className="text-primary font-medium ml-1">
              {t("add_time")}
            </Text>
          </Pressable>
        </View>

        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="time"
          onConfirm={handleConfirm}
          onCancel={() => setDatePickerVisibility(false)}
        />
      </View>
      <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
        <Text className="text-xl text-primary">{t("additional_notes")}</Text>
        <TextInput
          value={note}
          onChangeText={(newNote) => setNote(newNote)}
          multiline={true}
          keyboardType="default"
          placeholder="eg. take with food"
          placeholderTextColor="#888888"
          textAlignVertical="top"
          className="text-primary align-text-top text-base h-40 bg-white border border-primary rounded-2xl px-3 web:pt-3"
        />
      </View>
      <View className="items-center mt-8">
        <Pressable
          className="items-center justify-center bg-primary rounded-xl p-4 w-60"
          onPress={async () => {
            const success = await addMedicine(db, {
              id: 0, // ID will be auto-generated by the database
              medicine_name: name.trim(),
              type: "Custom Input",
              count: parseInt(amount) || 0,
              whenToTake: times.join(","),
              additional: note.trim(),
            });
            if (success) {
              showToast("Medication added successfully!");
              router.back();
            } else {
              showToast("Failed to save medication", "error");
            }
          }}
        >
          <Text className="text-2xl text-white">{t("save")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
