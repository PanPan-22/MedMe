import { Medication } from "@/components/local-db";
import { insertLogAndSync, updateScheduleAndSync } from "@/db/sync-helpers";
import { cancelNotificationsForMed, scheduleNotificationsForMed } from "@/hooks/use-notifications";
import { toLocalISODate } from "@/lib/date";
import { useUser } from "@clerk/expo";
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
  const { user } = useUser();
  const role = (user?.unsafeMetadata as any)?.role as "patient" | "caretaker" | undefined;
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
    if (!user || !role) { router.back(); return; }
    const today = toLocalISODate(new Date());
    const timestamp = new Date().toISOString();
    for (const med of meds) {
      const status: "taken" | "skipped" = checked[med.id] ? "taken" : "skipped";
      await insertLogAndSync(db, user.id, role, {
        medication_id: med.id,
        scheduled_time: time,
        log_date: today,
        timestamp,
        status,
        patient_id: pid ?? null,
      });

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

      await updateScheduleAndSync(db, user.id, role, med.id, {
        stock: newStock,
        end_date: toLocalISODate(newEndDate),
        notification_id: newIds,
      });
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
              className="active:opacity-70 flex-row items-center gap-4 bg-card border border-primary/10 rounded-2xl px-4 py-4"
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
