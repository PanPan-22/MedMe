import { useToast } from "@/context/toast-context";
import { insertScheduleAndSync, updateScheduleAndSync } from "@/db/sync-helpers";
import { useBrandColor } from "@/hooks/use-brand-color";
import { scheduleNotificationsForMed } from "@/hooks/use-notifications";
import { toLocalISODate } from "@/lib/date";
import { uploadMedImage } from "@/lib/upload";
import { useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { SheetManager } from "react-native-actions-sheet";

const formatDate = (d: Date) =>
  `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;

const MEDICATION_TYPES = ["Pills", "Capsule", "Injection", "Other"];
const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_KEYS: Record<string, string> = {
  Mon: "day_mon", Tue: "day_tue", Wed: "day_wed", Thu: "day_thu",
  Fri: "day_fri", Sat: "day_sat", Sun: "day_sun",
};

export default function ConfirmMedicationScreen() {
  const { t } = useTranslation();
  const { primary: brandColor } = useBrandColor();
  const { showToast } = useToast();
  const db = useSQLiteContext();
  const { user } = useUser();
  const role = (user?.unsafeMetadata as any)?.role as "patient" | "caretaker" | undefined;
  const params = useLocalSearchParams();
  const pid = params.patientId ? parseInt(params.patientId as string) : null;

  const [name, setName] = useState((params.medicine_name as string) || "");
  const [amount, setAmount] = useState((params.count as string) || "");
  const [note, setNote] = useState((params.additional as string) || "");
  const [medType, setMedType] = useState((params.type as string) || "Pills");
  const [stock, setStock] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [times, setTimes] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>(DAYS_OF_WEEK);
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);
  const [isExpiryPickerVisible, setExpiryPickerVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (params.whenToTake) {
      const timeArray = (params.whenToTake as string).split(",").map((s) => s.trim());
      setTimes(timeArray.sort());
    }
  }, [params.whenToTake]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t("error_required");
    if (!amount.trim() || parseInt(amount) <= 0) e.amount = t("error_invalid_amount");
    if (!stock.trim() || parseInt(stock) <= 0) e.stock = t("error_invalid_stock");
    if (selectedDays.length === 0) e.days = t("error_select_day");
    if (times.length === 0) e.times = t("error_add_time");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleTimeConfirm = (date: Date) => {
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    const newTime = `${h}:${m}`;
    if (editingTimeIndex !== null) {
      const updated = times.map((t, i) => (i === editingTimeIndex ? newTime : t));
      setTimes([...new Set(updated)].sort());
    } else if (!times.includes(newTime)) {
      setTimes([...times, newTime].sort());
    }
    setErrors((e) => ({ ...e, times: "" }));
    setEditingTimeIndex(null);
    setTimePickerVisible(false);
  };

  const removeTime = (index: number) => {
    setTimes(times.filter((_, i) => i !== index));
  };

  const pickerDate = editingTimeIndex !== null
    ? (() => { const [h, m] = times[editingTimeIndex].split(":"); const d = new Date(); d.setHours(+h, +m, 0); return d; })()
    : new Date();

  const handleImagePicker = async () => {
    const result = (await SheetManager.show("image-picker-sheet")) as { uri: string } | undefined;
    if (result?.uri) setImageUri(result.uri);
  };

  return (
    <ScrollView className="bg-background px-4 pt-4 h-full" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Stack.Screen options={{ headerShown: true, title: t("confirm_medication_title") }} />

      <View className="flex-row items-center gap-4 p-2 mb-4">
        <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={24} color={brandColor} />
        </Pressable>
        <Text className="text-2xl font-bold text-primary">{t("review_details")}</Text>
      </View>

      {/* Medicine Image */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("medicine_image")}</Text>
        <Pressable
          onPress={handleImagePicker}
          className="border-2 border-dashed border-primary rounded-2xl h-40 items-center justify-center overflow-hidden bg-card"
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View className="items-center gap-2">
              <Ionicons name="camera-outline" size={36} color={brandColor} />
              <Text className="text-primary text-sm">{t("tap_to_add_photo")}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Medication Name */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("medication_name")}</Text>
        <TextInput
          value={name}
          onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: "" })); }}
          placeholder={t("placeholder_medicine")}
          placeholderTextColor="#888888"
          className={`text-primary bg-card border rounded-2xl px-4 text-base h-12 ${errors.name ? "border-red-500" : "border-primary"}`}
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
              className={`px-4 py-2 rounded-full border ${medType === mType ? "bg-primary border-primary" : "bg-card border-muted"}`}
            >
              <Text className={medType === mType ? "text-background font-semibold" : "text-primary/60"}>{mType}</Text>
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
            placeholder={t("placeholder_amount")}
            placeholderTextColor="#888888"
            className={`text-primary bg-card border rounded-2xl px-4 text-base h-12 ${errors.amount ? "border-red-500" : "border-primary"}`}
          />
          {errors.amount ? <Text className="text-red-500 text-xs">{errors.amount}</Text> : null}
        </View>
        <View className="flex-1 gap-2">
          <Text className="text-base font-semibold text-primary">{t("stock")}</Text>
          <TextInput
            value={stock}
            onChangeText={(v) => { setStock(v); setErrors((e) => ({ ...e, stock: "" })); }}
            keyboardType="numeric"
            placeholder={t("placeholder_stock")}
            placeholderTextColor="#888888"
            className={`text-primary bg-card border rounded-2xl px-4 text-base h-12 ${errors.stock ? "border-red-500" : "border-primary"}`}
          />
          {errors.stock ? <Text className="text-red-500 text-xs">{errors.stock}</Text> : null}
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
                onPress={() => {
                  const next = isSelected ? selectedDays.filter((d) => d !== day) : [...selectedDays, day];
                  setSelectedDays(next);
                  if (next.length > 0) setErrors((e) => ({ ...e, days: "" }));
                }}
                className={`w-10 h-10 rounded-full items-center justify-center ${isSelected ? "bg-primary border-2 border-primary" : "bg-card border border-muted"}`}
              >
                <Text className={`text-xs font-bold ${isSelected ? "text-background" : "text-primary/60"}`}>
                  {t(DAY_KEYS[day])}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errors.days ? <Text className="text-red-500 text-xs">{errors.days}</Text> : null}
      </View>

      {/* Schedule */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("schedule")}</Text>
        <View className="flex-row flex-wrap gap-2 items-center">
          {times.map((time, index) => (
            <Pressable key={index} onPress={() => { setEditingTimeIndex(index); setTimePickerVisible(true); }} className="flex-row items-center bg-primary/10 border border-primary rounded-full px-3 py-1.5">
              <Text className="text-primary font-bold mr-2">{time}</Text>
              <Pressable onPress={(e) => { e.stopPropagation(); removeTime(index); }}>
                <Ionicons name="close-circle" size={18} color="#ef4444" />
              </Pressable>
            </Pressable>
          ))}
          <Pressable
            className="flex-row items-center bg-card border border-dashed border-primary rounded-full px-3 py-1.5"
            onPress={() => { setEditingTimeIndex(null); setTimePickerVisible(true); }}
          >
            <Ionicons name="add" size={16} color={brandColor} />
            <Text className="text-primary font-medium ml-1 text-sm">{t("add_time")}</Text>
          </Pressable>
        </View>
        {errors.times ? <Text className="text-red-500 text-xs">{errors.times}</Text> : null}
      </View>

      {/* Expiry Date */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("expiry_date")}</Text>
        <Pressable
          onPress={() => setExpiryPickerVisible(true)}
          className="bg-card border border-primary rounded-2xl px-4 h-12 justify-center"
        >
          <Text className="text-primary">
            {expirationDate ? formatDate(expirationDate) : "Select date"}
          </Text>
        </Pressable>
      </View>

      {/* Additional Notes */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("additional_notes")}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          textAlignVertical="top"
          placeholder={t("placeholder_notes")}
          placeholderTextColor="#888888"
          className="text-primary text-base h-28 bg-card border border-primary rounded-2xl p-4"
        />
      </View>

      {/* Save */}
      <View className="px-2 mt-4 mb-10">
        <Pressable
          className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full shadow-sm"
          onPress={async () => {
            if (!validate()) return;
            if (!user || !role) {
              showToast(t("not_signed_in"), "error");
              return;
            }
            const endDate = (() => {
              const s = parseInt(stock) || 0;
              const a = parseInt(amount) || 1;
              const days = times.length > 0 ? Math.floor(s / (a * times.length)) : 0;
              const end = new Date();
              end.setDate(end.getDate() + days);
              return toLocalISODate(end);
            })();
            try {
              let uploadedUri = "";
              if (imageUri) {
                try { uploadedUri = await uploadMedImage(imageUri, user.id); }
                catch (e) { console.warn("image upload failed, saving without:", e); }
              }
              const { id } = await insertScheduleAndSync(db, user.id, role, {
                medicine_name: name.trim(),
                type: medType,
                count: parseInt(amount) || 0,
                whenToTake: times.join(","),
                additional: note.trim(),
                stock: parseInt(stock) || 0,
                expiration_date: expirationDate ? toLocalISODate(expirationDate) : "",
                image_uri: uploadedUri,
                repeat_days: selectedDays.join(","),
                start_date: toLocalISODate(new Date()),
                end_date: endDate,
                patient_id: pid,
              });
              try {
                const notifIds = await scheduleNotificationsForMed({
                  medicineName: name.trim(),
                  whenToTake: times.join(","),
                  repeatDays: selectedDays.join(","),
                  stock: parseInt(stock) || 0,
                  count: parseInt(amount) || 1,
                  startDate: toLocalISODate(new Date()),
                  patientId: pid,
                });
                await updateScheduleAndSync(db, user.id, role, id, { notification_id: notifIds });
              } catch (e) {
                console.error("Failed to schedule notifications:", e);
              }
              showToast(t("medication_saved_success"));
              router.dismiss(2);
            } catch {
              showToast(t("medication_save_failed"), "error");
            }
          }}
        >
          <Text className="text-background text-xl font-bold">{t("save")}</Text>
        </Pressable>
      </View>

      <DateTimePickerModal isVisible={isTimePickerVisible} mode="time" date={pickerDate} onConfirm={handleTimeConfirm} onCancel={() => { setEditingTimeIndex(null); setTimePickerVisible(false); }} />
      <DateTimePickerModal isVisible={isExpiryPickerVisible} mode="date" onConfirm={(d) => { setExpirationDate(d); setExpiryPickerVisible(false); }} onCancel={() => setExpiryPickerVisible(false)} />
    </ScrollView>
  );
}
