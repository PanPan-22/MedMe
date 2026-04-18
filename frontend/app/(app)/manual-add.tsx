import { saveToDB as addMedicine } from "@/components/local-db";
import { useToast } from "@/context/toast-context";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { SheetManager } from "react-native-actions-sheet";

const MEDICATION_TYPES = ["Pills", "Capsule", "Injection", "Other"];
const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const TYPE_KEYS: Record<string, string> = {
  Pills: "type_pills", Capsule: "type_capsule", Injection: "type_injection", Other: "type_other",
};
const DAY_KEYS: Record<string, string> = {
  Mon: "day_mon", Tue: "day_tue", Wed: "day_wed", Thu: "day_thu",
  Fri: "day_fri", Sat: "day_sat", Sun: "day_sun",
};

export default function ManualAddScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const db = useSQLiteContext();

  const [name, setName] = useState("");
  const [medType, setMedType] = useState("Pills");
  const [amount, setAmount] = useState("");
  const [stock, setStock] = useState("");
  const [note, setNote] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [times, setTimes] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>(DAYS_OF_WEEK);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
  const [isStartDatePickerVisible, setStartDatePickerVisible] = useState(false);
  const [isEndDatePickerVisible, setEndDatePickerVisible] = useState(false);
  const [isExpiryPickerVisible, setExpiryPickerVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Required";
    if (!amount.trim() || parseInt(amount) <= 0) e.amount = "Enter a valid amount";
    if (times.length === 0) e.times = "Add at least one time";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleTimeConfirm = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const newTime = `${hours}:${minutes}`;
    if (!times.includes(newTime)) setTimes([...times, newTime].sort());
    setTimePickerVisible(false);
  };

  const removeTime = (index: number) => {
    setTimes(times.filter((_, i) => i !== index));
  };

  const handleImagePicker = async () => {
    const result = (await SheetManager.show("image-picker-sheet")) as { uri: string } | undefined;
    if (result?.uri) setImageUri(result.uri);
  };

  return (
    <ScrollView className="bg-background px-4 pt-4 h-full">
      <Stack.Screen options={{ headerShown: true, title: "Manual Add" }} />

      <View className="flex-row items-center gap-4 p-2 mb-4">
        <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
        </Pressable>
        <Text className="text-2xl font-bold text-primary">{t("fill_field")}</Text>
      </View>

      {/* Medicine Image */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("medicine_image")}</Text>
        <Pressable
          onPress={handleImagePicker}
          className="border-2 border-dashed border-primary rounded-2xl overflow-hidden bg-white items-center justify-center"
          style={{ aspectRatio: 4 / 3 }}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              resizeMode="contain"
            />
          ) : (
            <View className="items-center gap-2">
              <Ionicons name="camera-outline" size={40} color={colors.primary} />
              <Text className="text-primary text-sm">Tap to add photo</Text>
            </View>
          )}
        </Pressable>
        {imageUri && (
          <Pressable onPress={() => setImageUri(null)} className="active:opacity-70 self-end bg-red-500 px-4 py-2 rounded-xl">
            <Text className="text-white font-semibold text-sm">{t("clear")}</Text>
          </Pressable>
        )}
      </View>

      {/* Medication Name */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("medication_name")}</Text>
        <TextInput
          value={name}
          onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: "" })); }}
          placeholder="eg. Aspirin"
          placeholderTextColor="#888888"
          className={`text-primary bg-white border rounded-2xl px-4 text-base h-12 ${errors.name ? "border-red-500" : "border-primary"}`}
        />
        {errors.name ? <Text className="text-red-500 text-xs">{errors.name}</Text> : null}
      </View>

      {/* Type */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("type")}</Text>
        <View className="flex-row gap-2">
          {MEDICATION_TYPES.map((mType) => (
            <Pressable
              key={mType}
              onPress={() => setMedType(mType)}
              className={`px-4 py-2 rounded-full border ${medType === mType ? "bg-primary border-primary" : "bg-white border-gray-300"}`}
            >
              <Text className={medType === mType ? "text-white font-semibold" : "text-gray-500"}>{t(TYPE_KEYS[mType])}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Amount + Stock */}
      <View className="flex-row gap-4 px-2 mb-4">
        <View className="flex-1 gap-2">
          <Text className="text-base font-semibold text-primary">{t("amount")}</Text>
          <TextInput
            value={amount}
            onChangeText={(v) => { setAmount(v); setErrors((e) => ({ ...e, amount: "" })); }}
            keyboardType="numeric"
            placeholder="eg. 1"
            placeholderTextColor="#888888"
            className={`text-primary bg-white border rounded-2xl px-4 text-base h-12 ${errors.amount ? "border-red-500" : "border-primary"}`}
          />
          {errors.amount ? <Text className="text-red-500 text-xs">{errors.amount}</Text> : null}
        </View>
        <View className="flex-1 gap-2">
          <Text className="text-base font-semibold text-primary">{t("stock")}</Text>
          <TextInput
            value={stock}
            onChangeText={setStock}
            keyboardType="numeric"
            placeholder="eg. 30"
            placeholderTextColor="#888888"
            className="text-primary bg-white border border-primary rounded-2xl px-4 text-base h-12"
          />
        </View>
      </View>

      {/* Repeat On */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("repeat_on")}</Text>
        <View className="flex-row justify-between">
          {DAYS_OF_WEEK.map((day) => {
            const isSelected = selectedDays.includes(day);
            return (
              <Pressable
                key={day}
                onPress={() =>
                  setSelectedDays(
                    isSelected ? selectedDays.filter((d) => d !== day) : [...selectedDays, day]
                  )
                }
                className={`w-10 h-10 rounded-full items-center justify-center ${
                  isSelected ? "bg-primary border-2 border-primary" : "bg-white border border-gray-300"
                }`}
              >
                <Text className={`text-xs font-bold ${isSelected ? "text-white" : "text-gray-400"}`}>
                  {t(DAY_KEYS[day])}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Schedule */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("schedule")}</Text>
        <View className="flex-row flex-wrap gap-2 items-center">
          {times.map((time, index) => (
            <View key={time} className="flex-row items-center bg-primary/10 border border-primary rounded-full px-3 py-1.5">
              <Text className="text-primary font-bold mr-2">{time}</Text>
              <Pressable onPress={() => removeTime(index)}>
                <Ionicons name="close-circle" size={18} color="#ef4444" />
              </Pressable>
            </View>
          ))}
          <Pressable
            className="flex-row items-center bg-white border border-dashed border-primary rounded-full px-3 py-1.5"
            onPress={() => setTimePickerVisible(true)}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text className="text-primary font-medium ml-1 text-sm">{t("add_time")}</Text>
          </Pressable>
        </View>
        {errors.times ? <Text className="text-red-500 text-xs">{errors.times}</Text> : null}
      </View>

      {/* Dates: Start | End | Expiry */}
      <View className="flex-row gap-3 px-2 mb-4">
        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold text-primary">{t("start_date")}</Text>
          <Pressable onPress={() => setStartDatePickerVisible(true)} className="bg-white border border-primary rounded-xl h-10 justify-center">
            <Text className="text-primary text-xs text-center">{startDate.toLocaleDateString()}</Text>
          </Pressable>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold text-primary">{t("end_date")}</Text>
          <Pressable onPress={() => setEndDatePickerVisible(true)} className="bg-white border border-primary rounded-xl h-10 justify-center">
            <Text className="text-primary text-xs text-center">{endDate.toLocaleDateString()}</Text>
          </Pressable>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold text-primary">{t("expiry_date")}</Text>
          <Pressable onPress={() => setExpiryPickerVisible(true)} className="bg-white border border-primary rounded-xl h-10 justify-center">
            <Text className="text-primary text-xs text-center">
              {expirationDate ? expirationDate.toLocaleDateString() : "—"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Additional Notes */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("additional_notes")}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="eg. take with food"
          placeholderTextColor="#888888"
          textAlignVertical="top"
          className="text-primary text-base h-28 bg-white border border-primary rounded-2xl p-4"
        />
      </View>

      {/* Save */}
      <View className="px-2 mt-4 mb-10">
        <Pressable
          className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full shadow-sm"
          onPress={async () => {
            if (!validate()) return;
            const success = await addMedicine(db, {
              id: 0,
              medicine_name: name.trim(),
              type: medType,
              count: parseInt(amount) || 0,
              whenToTake: times.join(","),
              additional: note.trim(),
              stock: parseInt(stock) || 0,
              expiration_date: expirationDate ? expirationDate.toISOString().split("T")[0] : "",
              image_uri: imageUri ?? "",
              repeat_days: selectedDays.join(","),
              start_date: startDate.toISOString().split("T")[0],
              end_date: endDate.toISOString().split("T")[0],
            });
            if (success) {
              showToast("Medication added successfully!");
              router.back();
            } else {
              showToast("Failed to save medication", "error");
            }
          }}
        >
          <Text className="text-white text-xl font-bold">{t("save")}</Text>
        </Pressable>
      </View>

      <DateTimePickerModal isVisible={isTimePickerVisible} mode="time" onConfirm={handleTimeConfirm} onCancel={() => setTimePickerVisible(false)} />
      <DateTimePickerModal isVisible={isStartDatePickerVisible} mode="date" onConfirm={(d) => { setStartDate(d); setStartDatePickerVisible(false); }} onCancel={() => setStartDatePickerVisible(false)} />
      <DateTimePickerModal isVisible={isEndDatePickerVisible} mode="date" onConfirm={(d) => { setEndDate(d); setEndDatePickerVisible(false); }} onCancel={() => setEndDatePickerVisible(false)} />
      <DateTimePickerModal isVisible={isExpiryPickerVisible} mode="date" onConfirm={(d) => { setExpirationDate(d); setExpiryPickerVisible(false); }} onCancel={() => setExpiryPickerVisible(false)} />
    </ScrollView>
  );
}
