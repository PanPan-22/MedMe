import { Medication } from "@/components/local-db";
import { cancelNotificationsForMed, scheduleNotificationsForMed } from "@/hooks/use-notifications";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function NotificationModal() {
  const { time, patientId } = useLocalSearchParams<{ time: string; patientId?: string }>();
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  const pid = patientId ? parseInt(patientId) : null;

  const [meds, setMeds] = useState<Medication[]>([]);
  // true = taken, false = skipped
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const fetch = async () => {
      const query = pid !== null
        ? "SELECT * FROM schedules WHERE patient_id = ?"
        : "SELECT * FROM schedules WHERE patient_id IS NULL";
      const all = await db.getAllAsync<Medication>(query, pid !== null ? [pid] : []);
      const atTime = all.filter((m) =>
        m.whenToTake?.split(",").map((s) => s.trim()).includes(time)
      );
      setMeds(atTime);
      const initial: Record<number, boolean> = {};
      atTime.forEach((m) => { initial[m.id] = true; });
      setChecked(initial);
    };
    fetch();
  }, [time, pid]);

  const toggle = (id: number) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const confirm = async () => {
    const today = new Date().toISOString().split("T")[0];
    const timestamp = new Date().toISOString();
    for (const med of meds) {
      const status = checked[med.id] ? "taken" : "skipped";
      await db.runAsync(
        "INSERT INTO medication_logs (medication_id, scheduled_time, log_date, timestamp, status, patient_id) VALUES (?, ?, ?, ?, ?, ?)",
        [med.id, time, today, timestamp, status, pid ?? null],
      );

      // For taken: reduce stock. For skipped: stock unchanged.
      // Either way, the fired notification is consumed by the OS (one-time DATE trigger),
      // so we always reschedule to maintain the correct future notification count.
      const newStock = checked[med.id]
        ? Math.max(0, (med.stock ?? 0) - (med.count ?? 1))
        : (med.stock ?? 0);
      const timesCount = (med.whenToTake ?? "").split(",").filter(Boolean).length;
      const daysLeft = timesCount > 0 && (med.count ?? 1) > 0
        ? Math.floor(newStock / ((med.count ?? 1) * timesCount)) : 0;
      const newEndDate = new Date();
      newEndDate.setDate(newEndDate.getDate() + daysLeft);

      await cancelNotificationsForMed(med.notification_id ?? "");
      const newIds = await scheduleNotificationsForMed({
        medicineName: med.medicine_name,
        whenToTake: med.whenToTake ?? "",
        repeatDays: med.repeat_days ?? "",
        stock: newStock,
        count: med.count ?? 1,
        startDate: med.start_date,
        patientId: med.patient_id,
      });

      await db.runAsync(
        "UPDATE schedules SET stock = ?, end_date = ?, notification_id = ? WHERE id = ?",
        [newStock, newEndDate.toISOString().split("T")[0], newIds, med.id],
      );
    }
    router.back();
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 16 }}>
      {/* Header */}
      <View className="px-6 mb-6">
        <Text className="text-primary/50 text-sm font-medium">{t("schedule")}</Text>
        <Text className="text-primary text-4xl font-bold">{time}</Text>
      </View>

      {/* Med list */}
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        {meds.length === 0 ? (
          <Text className="text-primary/50 text-center mt-10">{t("no_medications")}</Text>
        ) : (
          meds.map((med) => (
            <Pressable
              key={med.id}
              onPress={() => toggle(med.id)}
              className="active:opacity-70 flex-row items-center gap-4 bg-white border border-primary/10 rounded-2xl px-4 py-4"
            >
              <View
                className={`w-7 h-7 rounded-lg border-2 items-center justify-center ${
                  checked[med.id] ? "bg-primary border-primary" : "border-primary/30"
                }`}
              >
                {checked[med.id] && (
                  <Ionicons name="checkmark" size={16} color="white" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-primary font-semibold text-base">{med.medicine_name}</Text>
                <Text className="text-primary/50 text-sm">{med.count} {med.type}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Confirm */}
      <View className="px-6 pb-10 pt-4">
        <Pressable
          className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full"
          onPress={confirm}
          disabled={meds.length === 0}
        >
          <Text className="text-white text-lg font-bold">{t("confirm")}</Text>
        </Pressable>
      </View>
    </View>
  );
}
