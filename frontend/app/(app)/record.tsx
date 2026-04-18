import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, SectionList, Text, View } from "react-native";

interface LogRow {
  id: number;
  medication_id: number;
  scheduled_time: string;
  log_date: string;
  timestamp: string;
  status: string;
  patient_id: number | null;
  medicine_name: string;
}

interface TimeGroup {
  scheduled_time: string;
  entries: LogRow[];
}

interface Section {
  title: string; // log_date
  data: TimeGroup[];
}

const PRESETS = [
  { label: "3D", days: 3 },
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
];

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n + 1);
  return d.toISOString().split("T")[0];
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function groupOverallStatus(entries: LogRow[]): "all_taken" | "all_skipped" | "partial" {
  const taken = entries.filter((e) => e.status === "taken").length;
  if (taken === entries.length) return "all_taken";
  if (taken === 0) return "all_skipped";
  return "partial";
}

function StatusBadge({ status }: { status: "all_taken" | "all_skipped" | "partial" }) {
  const colors = {
    all_taken: "bg-green-100 text-green-700",
    all_skipped: "bg-red-100 text-red-600",
    partial: "bg-amber-100 text-amber-700",
  };
  const labels = { all_taken: "All taken", all_skipped: "All skipped", partial: "Partial" };
  return (
    <View className={`px-3 py-1 rounded-full ${colors[status].split(" ")[0]}`}>
      <Text className={`text-xs font-semibold ${colors[status].split(" ")[1]}`}>{labels[status]}</Text>
    </View>
  );
}

export default function RecordScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const { patientId, patientName } = useLocalSearchParams<{ patientId?: string; patientName?: string }>();
  const pid = patientId ? parseInt(patientId) : null;

  const [preset, setPreset] = useState(3);
  const [sections, setSections] = useState<Section[]>([]);

  useFocusEffect(useCallback(() => { fetchLogs(); }, [pid, preset]));

  const fetchLogs = async () => {
    const from = dateNDaysAgo(preset);
    const to = todayStr();
    const query = pid !== null
      ? `SELECT l.*, s.medicine_name FROM medication_logs l LEFT JOIN schedules s ON l.medication_id = s.id WHERE l.patient_id = ? AND l.log_date >= ? AND l.log_date <= ? ORDER BY l.log_date DESC, l.scheduled_time ASC`
      : `SELECT l.*, s.medicine_name FROM medication_logs l LEFT JOIN schedules s ON l.medication_id = s.id WHERE l.patient_id IS NULL AND l.log_date >= ? AND l.log_date <= ? ORDER BY l.log_date DESC, l.scheduled_time ASC`;
    const args = pid !== null ? [pid, from, to] : [from, to];
    const rows = await db.getAllAsync<LogRow>(query, args);

    // Group by log_date → scheduled_time
    const dateMap = new Map<string, Map<string, LogRow[]>>();
    for (const row of rows) {
      if (!dateMap.has(row.log_date)) dateMap.set(row.log_date, new Map());
      const timeMap = dateMap.get(row.log_date)!;
      if (!timeMap.has(row.scheduled_time)) timeMap.set(row.scheduled_time, []);
      timeMap.get(row.scheduled_time)!.push(row);
    }

    const built: Section[] = Array.from(dateMap.entries()).map(([date, timeMap]) => ({
      title: date,
      data: Array.from(timeMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([time, entries]) => ({ scheduled_time: time, entries })),
    }));

    setSections(built);
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: "Record" }} />

      <View className="px-4 pt-4">
        {/* Header row */}
        <View className="flex-row items-center gap-4 mb-4">
          <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
          </Pressable>
          <Text className="text-2xl font-bold text-primary flex-1" numberOfLines={1}>
            {patientName ? `${patientName} — ${t("record")}` : t("record")}
          </Text>
        </View>

        {/* Date filter */}
        <View className="flex-row gap-2 mb-4">
          {PRESETS.map((p) => (
            <Pressable
              key={p.days}
              onPress={() => setPreset(p.days)}
              className={`px-4 py-2 rounded-full border ${preset === p.days ? "bg-primary border-primary" : "bg-white border-gray-300"}`}
            >
              <Text className={`text-sm font-semibold ${preset === p.days ? "text-white" : "text-gray-500"}`}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.scheduled_time}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListEmptyComponent={
          <Text className="text-center mt-16 text-primary/40 text-base">No records yet</Text>
        }
        renderSectionHeader={({ section }) => (
          <View className="py-2 mt-2">
            <Text className="text-sm font-bold text-primary/40">{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const overall = groupOverallStatus(item.entries);
          return (
            <View className="bg-white border border-primary/10 rounded-2xl mb-3 overflow-hidden">
              {/* Time header */}
              <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
                <Text className="text-primary font-bold text-lg">{item.scheduled_time}</Text>
                <StatusBadge status={overall} />
              </View>
              {/* Entries */}
              {item.entries.map((entry) => (
                <View key={entry.id} className="flex-row items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
                  <Text className="text-primary text-base flex-1" numberOfLines={1}>
                    {entry.medicine_name ?? `Med #${entry.medication_id}`}
                  </Text>
                  <View className={`flex-row items-center gap-1 px-2 py-1 rounded-full ${entry.status === "taken" ? "bg-green-50" : "bg-red-50"}`}>
                    <Ionicons
                      name={entry.status === "taken" ? "checkmark-circle" : "close-circle"}
                      size={14}
                      color={entry.status === "taken" ? "#16a34a" : "#dc2626"}
                    />
                    <Text className={`text-xs font-medium ${entry.status === "taken" ? "text-green-700" : "text-red-600"}`}>
                      {entry.status === "taken" ? "Taken" : "Skipped"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          );
        }}
      />
    </View>
  );
}
