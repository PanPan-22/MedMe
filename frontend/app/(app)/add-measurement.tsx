import { useToast } from "@/context/toast-context";
import { insertScheduleAndSync, updateScheduleAndSync } from "@/db/sync-helpers";
import { useBrandColor } from "@/hooks/use-brand-color";
import { scheduleNotificationsForMed } from "@/hooks/use-notifications";
import { toLocalISODate } from "@/lib/date";
import { useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_KEYS: Record<string, string> = {
  Mon: "day_mon", Tue: "day_tue", Wed: "day_wed", Thu: "day_thu",
  Fri: "day_fri", Sat: "day_sat", Sun: "day_sun",
};

const formatDate = (d: Date) =>
  `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;

export default function AddMeasurementScreen() {
  const { t } = useTranslation();
  const { primary: brandColor, background } = useBrandColor();
  const { showToast } = useToast();
  const db = useSQLiteContext();
  const { user } = useUser();
  const role = (user?.unsafeMetadata as any)?.role as "patient" | "caretaker" | undefined;
  const { kind: kindParam, patientId } = useLocalSearchParams<{ kind: string; patientId?: string }>();
  const kind = (kindParam === "blood_sugar" ? "blood_sugar" : "blood_pressure");
  const pid = patientId ? parseInt(patientId) : null;

  const [times, setTimes] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>(DAYS_OF_WEEK);
  const [startDate, setStartDate] = useState(new Date());
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);
  const [isStartDatePickerVisible, setStartDatePickerVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const title = kind === "blood_pressure" ? t("measurement_bp") : t("measurement_bs");

  const validate = (): boolean => {
    const e: Record<string, string> = {};
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
      const updated = times.map((t_, i) => (i === editingTimeIndex ? newTime : t_));
      setTimes([...new Set(updated)].sort());
    } else if (!times.includes(newTime)) {
      setTimes([...times, newTime].sort());
    }
    setErrors((e) => ({ ...e, times: "" }));
    setEditingTimeIndex(null);
    setTimePickerVisible(false);
  };

  const pickerDate = editingTimeIndex !== null
    ? (() => { const [h, m] = times[editingTimeIndex].split(":"); const d = new Date(); d.setHours(+h, +m, 0); return d; })()
    : new Date();

  const save = async () => {
    if (!validate()) return;
    if (!user || !role) { showToast(t("not_signed_in"), "error"); return; }
    try {
      const { id } = await insertScheduleAndSync(db, user.id, role, {
        medicine_name: title,
        type: null,
        count: 0,
        whenToTake: times.join(","),
        additional: "",
        stock: 0,
        expiration_date: "",
        image_uri: "",
        repeat_days: selectedDays.join(","),
        start_date: toLocalISODate(startDate),
        end_date: "",
        patient_id: pid,
        kind,
      });
      try {
        const notifIds = await scheduleNotificationsForMed({
          medicineName: title,
          whenToTake: times.join(","),
          repeatDays: selectedDays.join(","),
          stock: 9999,
          count: 1,
          startDate: toLocalISODate(startDate),
          patientId: pid,
        });
        await updateScheduleAndSync(db, user.id, role, id, { notification_id: notifIds });
      } catch (e) { console.error("Failed to schedule notifications:", e); }
      showToast(t("medication_added_success"));
      router.back();
    } catch {
      showToast(t("medication_save_failed"), "error");
    }
  };

  return (
    <ScrollView className="bg-background px-4 pt-4 h-full" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Stack.Screen options={{ headerShown: true, title: t("add_measurement") }} />

      <View className="flex-row items-center gap-4 p-2 mb-4">
        <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={24} color={brandColor} />
        </Pressable>
        <Text className="text-2xl font-bold text-primary">{title}</Text>
      </View>

      {/* Start Date */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("start_date")}</Text>
        <Pressable onPress={() => setStartDatePickerVisible(true)} className="bg-card border border-primary rounded-xl h-10 justify-center">
          <Text className="text-primary text-base pl-3">{formatDate(startDate)}</Text>
        </Pressable>
      </View>

      {/* Days */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("repeat_on")}</Text>
        <View className="flex-row gap-2">
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
                className={`w-10 h-10 rounded-full items-center justify-center ${
                  isSelected ? "bg-primary border-2 border-primary" : "bg-card border border-muted"
                }`}
              >
                <Text className={isSelected ? "text-background font-bold" : "text-primary/60"}>{t(DAY_KEYS[day])}</Text>
              </Pressable>
            );
          })}
        </View>
        {errors.days ? <Text className="text-red-500 text-xs">{errors.days}</Text> : null}
      </View>

      {/* Times */}
      <View className="gap-2 px-2 mb-4">
        <Text className="text-base font-semibold text-primary">{t("schedule")}</Text>
        <View className="flex-row flex-wrap gap-2 items-center">
          {times.map((time, i) => (
            <Pressable
              key={`${time}-${i}`}
              onPress={() => { setEditingTimeIndex(i); setTimePickerVisible(true); }}
              className="flex-row items-center bg-primary rounded-full px-3 py-1.5 gap-2"
            >
              <Text className="text-background font-semibold">{time}</Text>
              <Pressable onPress={() => setTimes(times.filter((_, idx) => idx !== i))} hitSlop={10}>
                <Ionicons name="close-circle" size={16} color={background} />
              </Pressable>
            </Pressable>
          ))}
          <Pressable
            onPress={() => { setEditingTimeIndex(null); setTimePickerVisible(true); }}
            className="flex-row items-center bg-card border border-dashed border-primary rounded-full px-3 py-1.5"
          >
            <Ionicons name="add" size={16} color={brandColor} />
            <Text className="text-primary font-semibold ml-1">{t("add_time")}</Text>
          </Pressable>
        </View>
        {errors.times ? <Text className="text-red-500 text-xs">{errors.times}</Text> : null}
      </View>

      {/* Save */}
      <View className="px-2 mt-4 mb-10">
        <Pressable
          className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full shadow-sm"
          onPress={save}
        >
          <Text className="text-background text-xl font-bold">{t("save")}</Text>
        </Pressable>
      </View>

      <DateTimePickerModal isVisible={isTimePickerVisible} mode="time" date={pickerDate} onConfirm={handleTimeConfirm} onCancel={() => { setEditingTimeIndex(null); setTimePickerVisible(false); }} />
      <DateTimePickerModal isVisible={isStartDatePickerVisible} mode="date" onConfirm={(d) => { setStartDate(d); setStartDatePickerVisible(false); }} onCancel={() => setStartDatePickerVisible(false)} />
    </ScrollView>
  );
}
