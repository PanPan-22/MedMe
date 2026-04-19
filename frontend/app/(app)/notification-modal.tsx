import { Schedule } from "@/components/local-db";
import { insertLogAndSync, updateScheduleAndSync } from "@/db/sync-helpers";
import { useBrandColor } from "@/hooks/use-brand-color";
import { cancelNotificationsForMed, scheduleNotificationsForMed } from "@/hooks/use-notifications";
import { toLocalISODate } from "@/lib/date";
import { useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function NotificationModal() {
  const { time, patientId } = useLocalSearchParams<{ time: string; patientId?: string }>();
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const { user } = useUser();
  const role = (user?.unsafeMetadata as any)?.role as "patient" | "caretaker" | undefined;
  const insets = useSafeAreaInsets();
  const { background } = useBrandColor();

  const pid = patientId ? parseInt(patientId) : null;

  const [meds, setMeds] = useState<Schedule[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [values, setValues] = useState<Record<number, string>>({});
  const [bpSys, setBpSys] = useState<Record<number, string>>({});
  const [bpDia, setBpDia] = useState<Record<number, string>>({});

  useEffect(() => {
    const fetch = async () => {
      const query = pid !== null
        ? "SELECT * FROM schedules WHERE patient_id = ?"
        : "SELECT * FROM schedules WHERE patient_id IS NULL";
      const all = await db.getAllAsync<Schedule>(query, pid !== null ? [pid] : []);
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
      const kind = med.kind ?? "medication";

      if (kind === "medication") {
        const status: "taken" | "skipped" = checked[med.id] ? "taken" : "skipped";
        await insertLogAndSync(db, user.id, role, {
          schedule_id: med.id,
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
      } else {
        let value: string;
        if (kind === "blood_pressure") {
          const sys = (bpSys[med.id] ?? "").trim();
          const dia = (bpDia[med.id] ?? "").trim();
          if (!sys || !dia) continue;
          value = `${sys}/${dia}`;
        } else {
          const v = (values[med.id] ?? "").trim();
          if (!v) continue;
          value = v;
        }
        await insertLogAndSync(db, user.id, role, {
          schedule_id: med.id,
          scheduled_time: time,
          log_date: today,
          timestamp,
          status: "recorded",
          patient_id: pid ?? null,
          value,
        });
      }
    }
    router.back();
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 16 }}>
      <View className="px-6 mb-6">
        <Text className="text-primary/50 text-sm font-medium">{t("schedule")}</Text>
        <Text className="text-primary text-4xl font-bold">{time}</Text>
      </View>

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {meds.length === 0 ? (
          <Text className="text-primary/50 text-center mt-10">{t("no_medications")}</Text>
        ) : (
          meds.map((med) => {
            const kind = med.kind ?? "medication";
            if (kind === "medication") {
              return (
                <Pressable
                  key={med.id}
                  onPress={() => toggle(med.id)}
                  className="active:opacity-70 flex-row items-center gap-4 bg-card border border-primary/20 rounded-2xl px-4 py-4"
                >
                  <View className={`w-7 h-7 rounded-lg border-2 items-center justify-center ${checked[med.id] ? "bg-primary border-primary" : "border-primary/40"}`}>
                    {checked[med.id] && <Ionicons name="checkmark" size={16} color={background} />}
                  </View>
                  <View className="flex-1">
                    <Text className="text-primary font-semibold text-base">{med.medicine_name}</Text>
                    <Text className="text-primary/50 text-sm">{med.count} {t(`type_${med.type?.toLowerCase()}`, { defaultValue: med.type })}</Text>
                  </View>
                </Pressable>
              );
            }
            if (kind === "blood_pressure") {
              return (
                <View key={med.id} className="bg-card border border-primary/20 rounded-2xl px-4 py-4 gap-2">
                  <Text className="text-primary font-semibold text-base">{med.medicine_name}</Text>
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={bpSys[med.id] ?? ""}
                      onChangeText={(v) => setBpSys((p) => ({ ...p, [med.id]: v.replace(/\D/g, "") }))}
                      placeholder={t("bp_systolic")}
                      placeholderTextColor="#888"
                      keyboardType="numeric"
                      maxLength={3}
                      className="flex-1 text-primary bg-background border border-primary rounded-xl px-3 py-2 text-base"
                    />
                    <Text className="text-primary text-xl font-bold">/</Text>
                    <TextInput
                      value={bpDia[med.id] ?? ""}
                      onChangeText={(v) => setBpDia((p) => ({ ...p, [med.id]: v.replace(/\D/g, "") }))}
                      placeholder={t("bp_diastolic")}
                      placeholderTextColor="#888"
                      keyboardType="numeric"
                      maxLength={3}
                      className="flex-1 text-primary bg-background border border-primary rounded-xl px-3 py-2 text-base"
                    />
                    <Text className="text-primary/50 text-sm">mmHg</Text>
                  </View>
                </View>
              );
            }
            // blood_sugar
            return (
              <View key={med.id} className="bg-card border border-primary/20 rounded-2xl px-4 py-4 gap-2">
                <Text className="text-primary font-semibold text-base">{med.medicine_name}</Text>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    value={values[med.id] ?? ""}
                    onChangeText={(v) => setValues((p) => ({ ...p, [med.id]: v.replace(/[^0-9.]/g, "") }))}
                    placeholder={t("bs_value")}
                    placeholderTextColor="#888"
                    keyboardType="numeric"
                    className="flex-1 text-primary bg-background border border-primary rounded-xl px-3 py-2 text-base"
                  />
                  <Text className="text-primary/50 text-sm">mg/dL</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View className="px-6 pb-10 pt-4">
        <Pressable
          className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full"
          onPress={confirm}
          disabled={meds.length === 0}
        >
          <Text className="text-background text-lg font-bold">{t("confirm")}</Text>
        </Pressable>
      </View>
    </View>
  );
}
