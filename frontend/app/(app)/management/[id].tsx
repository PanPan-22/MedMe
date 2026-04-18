import { Medication } from "@/components/local-db";
import { useToast } from "@/context/toast-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { SheetManager } from "react-native-actions-sheet";

const MEDICATION_TYPES = ["Pills", "Capsule", "Injection", "Other"];
const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAY_KEYS: Record<string, string> = {
  Mon: "day_mon", Tue: "day_tue", Wed: "day_wed", Thu: "day_thu",
  Fri: "day_fri", Sat: "day_sat", Sun: "day_sun",
};

const TYPE_KEYS: Record<string, string> = {
  Pills: "type_pills", Capsule: "type_capsule", Injection: "type_injection", Other: "type_other",
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl border border-primary/10 mb-4 overflow-hidden">
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center px-4 py-3">
      <Text className="text-sm font-semibold text-primary/50 w-24">{label}</Text>
      <View className="flex-1">{children}</View>
    </View>
  );
}

export default function MedicineDetailScreen() {
  const { id } = useLocalSearchParams();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [med, setMed] = useState<Medication | null>(null);
  const [editing, setEditing] = useState(false);

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
  const [isStartPickerVisible, setStartPickerVisible] = useState(false);
  const [isEndPickerVisible, setEndPickerVisible] = useState(false);
  const [isExpiryPickerVisible, setExpiryPickerVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { fetchMedication(); }, []);

  const fetchMedication = async () => {
    try {
      const result = await db.getFirstAsync<Medication>(
        "SELECT * FROM schedules WHERE id = ?", [id.toString()],
      );
      if (result) { setMed(result); populateFields(result); }
    } catch (e) { console.error(e); }
  };

  const populateFields = (m: Medication) => {
    setName(m.medicine_name);
    setMedType(m.type || "Pills");
    setAmount(m.count?.toString() ?? "");
    setStock(m.stock?.toString() ?? "");
    setNote(m.additional ?? "");
    setImageUri(m.image_uri || null);
    setTimes(m.whenToTake ? m.whenToTake.split(",").filter(Boolean) : []);
    setSelectedDays(m.repeat_days ? m.repeat_days.split(",").filter(Boolean) : DAYS_OF_WEEK);
    setStartDate(m.start_date ? new Date(m.start_date) : new Date());
    setEndDate(m.end_date ? new Date(m.end_date) : new Date());
    setExpirationDate(m.expiration_date ? new Date(m.expiration_date) : null);
  };

  const cancelEdit = () => {
    if (med) populateFields(med);
    setEditing(false);
    setErrors({});
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Required";
    if (!amount.trim() || parseInt(amount) <= 0) e.amount = "Enter a valid amount";
    if (times.length === 0) e.times = "Add at least one time";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    try {
      await db.runAsync(
        "UPDATE schedules SET medicine_name=?, type=?, count=?, whenToTake=?, additional=?, stock=?, expiration_date=?, image_uri=?, repeat_days=?, start_date=?, end_date=? WHERE id=?",
        [name.trim(), medType, parseInt(amount) || 0, times.join(","), note.trim(),
          parseInt(stock) || 0, expirationDate ? expirationDate.toISOString().split("T")[0] : "",
          imageUri ?? "", selectedDays.join(","),
          startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0],
          id.toString()],
      );
      showToast("Medication updated!");
      setEditing(false);
      fetchMedication();
    } catch { showToast("Failed to update", "error"); }
  };

  const handleTimeConfirm = (date: Date) => {
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    const newTime = `${h}:${m}`;
    if (!times.includes(newTime)) setTimes([...times, newTime].sort());
    setTimePickerVisible(false);
  };

  const handleImagePicker = async () => {
    const result = (await SheetManager.show("image-picker-sheet")) as { uri: string } | undefined;
    if (result?.uri) setImageUri(result.uri);
  };

  if (!med) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-primary/50">Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: true, title: "Detail" }} />

      <View className="px-4 pt-4 pb-12">
        {/* Header */}
        <View className="flex-row items-center justify-between p-2 mb-4 w-full">
          <View className="flex-row items-center gap-4 flex-1 mr-4">
            <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
              <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
            </Pressable>
            <Text className="text-2xl font-bold text-primary flex-1" numberOfLines={1}>
              {med.medicine_name}
            </Text>
          </View>

          {editing ? (
            <View className="flex-row gap-3 items-center">
              <Pressable hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} onPress={cancelEdit}>
                <Text className="text-primary/60 font-semibold">{t("cancel")}</Text>
              </Pressable>
              <Pressable className="active:opacity-70 bg-primary px-4 py-2 rounded-xl" onPress={save}>
                <Text className="text-background font-bold text-sm">{t("save")}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => setEditing(true)}>
              <Ionicons name="create-outline" size={28} color={colors.text} />
            </Pressable>
          )}
        </View>

        {/* Image */}
        {editing ? (
          <View className="gap-2 mb-4">
            <Text className="text-base font-semibold text-primary px-2">{t("medicine_image")}</Text>
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
        ) : imageUri ? (
          <View className="rounded-2xl overflow-hidden bg-white mb-4 border border-primary/10" style={{ aspectRatio: 4 / 3 }}>
            <Image
              source={{ uri: imageUri }}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {editing ? (
          <>
            {/* Name */}
            <View className="gap-2 px-2 mb-4">
              <Text className="text-base font-semibold text-primary">{t("medication_name")}</Text>
              <TextInput
                value={name}
                onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: "" })); }}
                placeholder="eg. Aspirin"
                placeholderTextColor="#888888"
                className={`text-primary bg-white border rounded-2xl px-4 py-3 text-base ${errors.name ? "border-red-500" : "border-primary"}`}
              />
              {errors.name ? <Text className="text-red-500 text-xs">{errors.name}</Text> : null}
            </View>

            {/* Type */}
            <View className="gap-2 px-2 mb-4">
              <Text className="text-base font-semibold text-primary">{t("type")}</Text>
              <View className="flex-row gap-2 flex-wrap">
                {MEDICATION_TYPES.map((mType) => (
                  <Pressable
                    key={mType}
                    onPress={() => setMedType(mType)}
                    className={`px-4 py-2 rounded-full border ${medType === mType ? "bg-primary border-primary" : "bg-white border-gray-300"}`}
                  >
                    <Text className={medType === mType ? "text-white font-semibold" : "text-gray-500"}>
                      {t(TYPE_KEYS[mType])}
                    </Text>
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
                  className={`text-primary bg-white border rounded-2xl px-4 py-3 text-base ${errors.amount ? "border-red-500" : "border-primary"}`}
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
                  className="text-primary bg-white border border-primary rounded-2xl px-4 py-3 text-base"
                />
              </View>
            </View>

            {/* Schedule */}
            <View className="gap-2 px-2 mb-4">
              <Text className="text-base font-semibold text-primary">{t("schedule")}</Text>
              <View className="flex-row flex-wrap gap-2 items-center">
                {times.map((time, index) => (
                  <View key={time} className="flex-row items-center bg-primary/10 border border-primary rounded-full px-3 py-1.5">
                    <Text className="text-primary font-bold mr-2">{time}</Text>
                    <Pressable onPress={() => setTimes(times.filter((_, i) => i !== index))}>
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

            {/* Repeat On */}
            <View className="gap-2 px-2 mb-4">
              <Text className="text-base font-semibold text-primary">{t("repeat_on")}</Text>
              <View className="flex-row justify-between">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected = selectedDays.includes(day);
                  return (
                    <Pressable
                      key={day}
                      onPress={() => setSelectedDays(isSelected ? selectedDays.filter((d) => d !== day) : [...selectedDays, day])}
                      className={`w-10 h-10 rounded-full items-center justify-center ${isSelected ? "bg-primary border-2 border-primary" : "bg-white border border-gray-300"}`}
                    >
                      <Text className={`text-xs font-bold ${isSelected ? "text-white" : "text-gray-400"}`}>
                        {t(DAY_KEYS[day])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Dates */}
            <View className="flex-row gap-3 px-2 mb-4">
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold text-primary">{t("start_date")}</Text>
                <Pressable onPress={() => setStartPickerVisible(true)} className="bg-white border border-primary rounded-xl py-3 px-3">
                  <Text className="text-primary text-xs text-center">{startDate.toLocaleDateString()}</Text>
                </Pressable>
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold text-primary">{t("end_date")}</Text>
                <Pressable onPress={() => setEndPickerVisible(true)} className="bg-white border border-primary rounded-xl py-3 px-3">
                  <Text className="text-primary text-xs text-center">{endDate.toLocaleDateString()}</Text>
                </Pressable>
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold text-primary">{t("expiry_date")}</Text>
                <Pressable onPress={() => setExpiryPickerVisible(true)} className="bg-white border border-primary rounded-xl py-3 px-3">
                  <Text className="text-primary text-xs text-center">{expirationDate ? expirationDate.toLocaleDateString() : "—"}</Text>
                </Pressable>
              </View>
            </View>

            {/* Notes */}
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
          </>
        ) : (
          <>
            {/* Info card */}
            <Card>
              <Row label={t("medication_name")}>
                <Text className="text-base text-primary font-medium">{med.medicine_name}</Text>
              </Row>
              <Row label={t("type")}>
                <View className="bg-primary self-start px-3 py-1 rounded-full">
                  <Text className="text-background text-sm font-semibold">{t(TYPE_KEYS[med.type] ?? "type_other")}</Text>
                </View>
              </Row>
              <Row label={t("amount")}>
                <Text className="text-base text-primary">{med.count ?? "—"}</Text>
              </Row>
              <Row label={t("stock")}>
                <Text className="text-base text-primary">{med.stock ?? "—"}</Text>
              </Row>
            </Card>

            {/* Schedule card */}
            <Card>
              <Row label={t("repeat_on")}>
                <View className="flex-row flex-wrap gap-1">
                  {DAYS_OF_WEEK.map((day) => {
                    const active = selectedDays.includes(day);
                    return (
                      <View key={day} className={`w-8 h-8 rounded-full items-center justify-center ${active ? "bg-primary" : "bg-primary/10"}`}>
                        <Text className={`text-xs font-bold ${active ? "text-background" : "text-primary/40"}`}>
                          {t(DAY_KEYS[day])}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Row>
              <Row label={t("schedule")}>
                <View className="flex-row flex-wrap gap-2">
                  {times.length > 0 ? times.map((time) => (
                    <View key={time} className="bg-primary/10 border border-primary rounded-full px-3 py-1">
                      <Text className="text-primary font-bold text-sm">{time}</Text>
                    </View>
                  )) : <Text className="text-primary/50">—</Text>}
                </View>
              </Row>
            </Card>

            {/* Dates card */}
            <Card>
              <Row label={t("start_date")}>
                <Text className="text-base text-primary">{startDate.toLocaleDateString()}</Text>
              </Row>
              <Row label={t("end_date")}>
                <Text className="text-base text-primary">{endDate.toLocaleDateString()}</Text>
              </Row>
              <Row label={t("expiry_date")}>
                <Text className="text-base text-primary">{expirationDate ? expirationDate.toLocaleDateString() : "—"}</Text>
              </Row>
            </Card>

            {/* Notes card */}
            {med.additional ? (
              <Card>
                <Row label={t("additional_notes")}>
                  <Text className="text-base text-primary">{med.additional}</Text>
                </Row>
              </Card>
            ) : null}
          </>
        )}
      </View>

      <DateTimePickerModal isVisible={isTimePickerVisible} mode="time" onConfirm={handleTimeConfirm} onCancel={() => setTimePickerVisible(false)} />
      <DateTimePickerModal isVisible={isStartPickerVisible} mode="date" onConfirm={(d) => { setStartDate(d); setStartPickerVisible(false); }} onCancel={() => setStartPickerVisible(false)} />
      <DateTimePickerModal isVisible={isEndPickerVisible} mode="date" onConfirm={(d) => { setEndDate(d); setEndPickerVisible(false); }} onCancel={() => setEndPickerVisible(false)} />
      <DateTimePickerModal isVisible={isExpiryPickerVisible} mode="date" onConfirm={(d) => { setExpirationDate(d); setExpiryPickerVisible(false); }} onCancel={() => setExpiryPickerVisible(false)} />
    </ScrollView>
  );
}
