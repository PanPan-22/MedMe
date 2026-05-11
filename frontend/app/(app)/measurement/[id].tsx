import { ConfirmModal } from "@/components/confirm-modal";
import { FieldLabel } from "@/components/field-label";
import { Schedule } from "@/components/local-db";
import { useToast } from "@/context/toast-context";
import { deleteScheduleAndSync, updateScheduleAndSync } from "@/db/sync-helpers";
import { useBrandColor } from "@/hooks/use-brand-color";
import { cancelNotificationsForMed, scheduleNotificationsForMed } from "@/hooks/use-notifications";
import { toLocalISODate } from "@/lib/date";
import { useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_KEYS: Record<string, string> = {
  Mon: "day_mon", Tue: "day_tue", Wed: "day_wed", Thu: "day_thu",
  Fri: "day_fri", Sat: "day_sat", Sun: "day_sun",
};

const formatDate = (d: Date) =>
  `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-card rounded-2xl border border-primary/20 mb-4 overflow-hidden">{children}</View>
  );
}

function Row({
  label,
  required,
  info,
  children,
}: {
  label: string;
  required?: boolean;
  info?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="px-4 py-3 gap-2 border-b border-primary/10 last:border-b-0">
      <FieldLabel size="sm" label={label} required={required} info={info} />
      <View>{children}</View>
    </View>
  );
}

export default function MeasurementDetailScreen() {
  const { id } = useLocalSearchParams();
  const db = useSQLiteContext();
  const { user } = useUser();
  const role = (user?.unsafeMetadata as any)?.role as "patient" | "caretaker" | undefined;
  const { primary: brandColor } = useBrandColor();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [med, setMed] = useState<Schedule | null>(null);
  const [editing, setEditing] = useState(false);

  const [times, setTimes] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>(DAYS_OF_WEEK);
  const [startDate, setStartDate] = useState(new Date());
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);
  const [isStartPickerVisible, setStartPickerVisible] = useState(false);
  const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { fetchMedication(); }, []);

  const fetchMedication = async () => {
    try {
      const result = await db.getFirstAsync<Schedule>(
        "SELECT * FROM schedules WHERE id = ?", [id.toString()],
      );
      if (result) { setMed(result); populateFields(result); }
    } catch (e) { console.error(e); }
  };

  const populateFields = (m: Schedule) => {
    setTimes(m.whenToTake ? m.whenToTake.split(",").filter(Boolean) : []);
    setSelectedDays(m.repeat_days ? m.repeat_days.split(",").filter(Boolean) : DAYS_OF_WEEK);
    setStartDate(m.start_date ? new Date(m.start_date) : new Date());
  };

  const cancelEdit = () => {
    if (med) populateFields(med);
    setEditing(false);
    setErrors({});
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (selectedDays.length === 0) e.days = t("error_select_day");
    if (times.length === 0) e.times = t("error_add_time");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!user || !role) { showToast(t("not_signed_in"), "error"); return; }
    try {
      await cancelNotificationsForMed(med?.notification_id ?? "");
      const notifIds = await scheduleNotificationsForMed({
        medicineName: med?.medicine_name ?? "",
        whenToTake: times.join(","),
        repeatDays: selectedDays.join(","),
        stock: 9999,
        count: 1,
        startDate: toLocalISODate(startDate),
        patientId: med?.patient_id,
      });
      await updateScheduleAndSync(db, user.id, role, Number(id), {
        whenToTake: times.join(","),
        repeat_days: selectedDays.join(","),
        start_date: toLocalISODate(startDate),
        notification_id: notifIds,
      });
      showToast(t("medication_updated"));
      setEditing(false);
      fetchMedication();
    } catch { showToast(t("medication_update_failed"), "error"); }
  };

  const confirmDeleteMed = async () => {
    if (!user || !role) return;
    setDeleteConfirmVisible(false);
    // deleteScheduleAndSync cancels notifications internally.
    await deleteScheduleAndSync(db, user.id, role, Number(id));
    showToast(t("medication_deleted"));
    router.back();
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

  if (!med) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-primary">{t("loading")}</Text>
      </View>
    );
  }

  const kindLabel = med.kind === "blood_pressure" ? t("measurement_bp") : t("measurement_bs");
  const kindIcon = med.kind === "blood_pressure" ? "heart-outline" : "water-outline";

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: t("detail") }} />

      <View className="flex-row items-center justify-between gap-4 px-6 pt-6 pb-6 bg-background">
        <View className="flex-row items-center gap-3 flex-1">
          <Pressable className="active:opacity-70" hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={24} color={brandColor} />
          </Pressable>
          <Ionicons name={kindIcon} size={24} color="#dc2626" />
          <Text className="text-2xl font-bold text-primary flex-1" numberOfLines={1}>{kindLabel}</Text>
        </View>
        {editing ? (
          <Pressable className="active:opacity-70" hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={cancelEdit}>
            <Text className="text-primary font-semibold">{t("cancel")}</Text>
          </Pressable>
        ) : (
          <Pressable className="active:opacity-70" hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => setEditing(true)}>
            <Ionicons name="create-outline" size={28} color={brandColor} />
          </Pressable>
        )}
      </View>

      <ScrollView className="px-4">
      {/* Schedule */}
      <Card>
        <Row label={t("schedule")} required info={t("info_measurement_schedule")}>
          {editing ? (
            <View className="flex-row flex-wrap gap-2 items-center">
              {times.map((time, i) => (
                <Pressable
                  key={`${time}-${i}`}
                  onPress={() => { setEditingTimeIndex(i); setTimePickerVisible(true); }}
                  className="active:opacity-70 flex-row items-center bg-primary rounded-full px-3 py-1.5 gap-2"
                >
                  <Text className="text-background font-semibold">{time}</Text>
                  <Pressable className="active:opacity-70" onPress={() => setTimes(times.filter((_, idx) => idx !== i))} hitSlop={10}>
                    <Ionicons name="close-circle" size={16} color="white" />
                  </Pressable>
                </Pressable>
              ))}
              <Pressable
                onPress={() => { setEditingTimeIndex(null); setTimePickerVisible(true); }}
                className="active:opacity-70 flex-row items-center bg-card border border-dashed border-primary rounded-full px-3 py-1.5"
              >
                <Ionicons name="add" size={16} color={brandColor} />
                <Text className="text-primary font-semibold ml-1">{t("add_time")}</Text>
              </Pressable>
            </View>
          ) : (
            <Text className="text-primary text-base">{times.length > 0 ? times.join(", ") : "—"}</Text>
          )}
          {errors.times ? <Text className="text-red-500 text-xs mt-1">{errors.times}</Text> : null}
        </Row>

        <Row label={t("repeat_on")} required info={t("info_measurement_repeat")}>
          {editing ? (
            <View className="flex-row flex-wrap gap-2">
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
                    className={`active:opacity-70 w-9 h-9 rounded-full items-center justify-center ${
                      isSelected ? "bg-primary border-2 border-primary" : "bg-card border border-muted"
                    }`}
                  >
                    <Text className={`text-xs ${isSelected ? "text-background font-bold" : "text-primary/60"}`}>{t(DAY_KEYS[day])}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text className="text-primary text-base">{selectedDays.map((d) => t(DAY_KEYS[d])).join(", ")}</Text>
          )}
          {errors.days ? <Text className="text-red-500 text-xs mt-1">{errors.days}</Text> : null}
        </Row>

        <Row label={t("start_date")} info={t("info_start_date")}>
          {editing ? (
            <Pressable onPress={() => setStartPickerVisible(true)} className="active:opacity-70 bg-card border border-primary rounded-xl px-3 py-2">
              <Text className="text-primary text-base">{formatDate(startDate)}</Text>
            </Pressable>
          ) : (
            <Text className="text-primary text-base">{formatDate(startDate)}</Text>
          )}
        </Row>
      </Card>

      {editing ? (
        <Pressable
          className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full mt-2"
          onPress={save}
        >
          <Text className="text-background text-xl font-bold">{t("save")}</Text>
        </Pressable>
      ) : (
        <Pressable
          className="active:opacity-70 items-center justify-center bg-red-500 rounded-2xl p-4 w-full mt-2"
          onPress={() => setDeleteConfirmVisible(true)}
        >
          <Text className="text-white text-xl font-bold">{t("delete")}</Text>
        </Pressable>
      )}

      <View className="h-10" />

      <DateTimePickerModal isVisible={isTimePickerVisible} mode="time" date={pickerDate} onConfirm={handleTimeConfirm} onCancel={() => { setEditingTimeIndex(null); setTimePickerVisible(false); }} />
      <DateTimePickerModal isVisible={isStartPickerVisible} mode="date" onConfirm={(d) => { setStartDate(d); setStartPickerVisible(false); }} onCancel={() => setStartPickerVisible(false)} />

      <ConfirmModal
        visible={isDeleteConfirmVisible}
        title={t("delete")}
        message={t("delete_confirm_med") ?? "Delete this?"}
        cancelText={t("cancel")}
        confirmText={t("delete")}
        destructive
        onCancel={() => setDeleteConfirmVisible(false)}
        onConfirm={confirmDeleteMed}
      />
      </ScrollView>
    </View>
  );
}
