import { useBrandColor } from "@/hooks/use-brand-color";
import { toLocalISODate } from "@/lib/date";
import Ionicons from "@expo/vector-icons/Ionicons";
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
  value: string | null;
  kind: string | null;
  count: number | null;
}

interface Summary {
  med: { taken: number; doses: number; adherence: number | null; names: string[] } | null;
  bp: { count: number; adherence: number | null; avg: string | null } | null;
  bs: { count: number; adherence: number | null; avg: string | null } | null;
}

function computeSummary(rows: LogRow[]): Summary {
  const medLogs = rows.filter((r) => !r.kind || r.kind === "medication");
  const bpLogs = rows.filter((r) => r.kind === "blood_pressure");
  const bsLogs = rows.filter((r) => r.kind === "blood_sugar");

  const taken = medLogs.filter((r) => r.status === "taken");
  const doses = taken.reduce((s, r) => s + (r.count ?? 1), 0);
  const medAdherence = medLogs.length > 0 ? Math.round((taken.length / medLogs.length) * 100) : null;
  const names = Array.from(new Set(medLogs.map((r) => r.medicine_name).filter(Boolean)));

  const bpRecorded = bpLogs.filter((r) => r.value);
  const bpAdherence = bpLogs.length > 0 ? Math.round((bpRecorded.length / bpLogs.length) * 100) : null;
  const bpSys: number[] = [];
  const bpDia: number[] = [];
  for (const r of bpRecorded) {
    const [s, d] = (r.value ?? "").split("/").map((v) => parseInt(v));
    if (!isNaN(s)) bpSys.push(s);
    if (!isNaN(d)) bpDia.push(d);
  }
  const bpAvg = bpSys.length && bpDia.length
    ? `${Math.round(bpSys.reduce((a, b) => a + b, 0) / bpSys.length)}/${Math.round(bpDia.reduce((a, b) => a + b, 0) / bpDia.length)}`
    : null;

  const bsRecorded = bsLogs.filter((r) => r.value);
  const bsAdherence = bsLogs.length > 0 ? Math.round((bsRecorded.length / bsLogs.length) * 100) : null;
  const bsValues = bsRecorded.map((r) => parseFloat(r.value ?? "")).filter((n) => !isNaN(n));
  const bsAvg = bsValues.length ? `${Math.round(bsValues.reduce((a, b) => a + b, 0) / bsValues.length)}` : null;

  return {
    med: medLogs.length ? { taken: taken.length, doses, adherence: medAdherence, names } : null,
    bp: bpLogs.length ? { count: bpRecorded.length, adherence: bpAdherence, avg: bpAvg } : null,
    bs: bsLogs.length ? { count: bsRecorded.length, adherence: bsAdherence, avg: bsAvg } : null,
  };
}

interface TimeGroup {
  scheduled_time: string;
  entries: LogRow[];
}

interface Section {
  title: string; // log_date
  data: TimeGroup[];
}

const PRESETS = [3, 7, 30];

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n + 1);
  return toLocalISODate(d);
}

function todayStr(): string {
  return toLocalISODate(new Date());
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
  const db = useSQLiteContext();
  const { patientId, patientName } = useLocalSearchParams<{ patientId?: string; patientName?: string }>();
  const pid = patientId ? parseInt(patientId) : null;

  const [preset, setPreset] = useState(3);
  const [sections, setSections] = useState<Section[]>([]);
  const [summary, setSummary] = useState<Summary>({ med: null, bp: null, bs: null });
  const { primary: brandColor } = useBrandColor();

  useFocusEffect(useCallback(() => { fetchLogs(); }, [pid, preset]));

  const fetchLogs = async () => {
    const from = dateNDaysAgo(preset);
    const to = todayStr();
    const query = pid !== null
      ? `SELECT l.*, s.medicine_name, s.kind, s.count FROM medication_logs l LEFT JOIN schedules s ON l.medication_id = s.id WHERE l.patient_id = ? AND l.log_date >= ? AND l.log_date <= ? ORDER BY l.log_date DESC, l.scheduled_time ASC`
      : `SELECT l.*, s.medicine_name, s.kind, s.count FROM medication_logs l LEFT JOIN schedules s ON l.medication_id = s.id WHERE l.patient_id IS NULL AND l.log_date >= ? AND l.log_date <= ? ORDER BY l.log_date DESC, l.scheduled_time ASC`;
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
    setSummary(computeSummary(rows));
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: t("record") }} />

      <View className="px-4 pt-4">
        {/* Header row */}
        <View className="flex-row items-center gap-4 mb-4">
          <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={24} color={brandColor} />
          </Pressable>
          <Text className="text-2xl font-bold text-primary flex-1" numberOfLines={1}>
            {patientName ? `${patientName} — ${t("record")}` : t("record")}
          </Text>
        </View>

        {/* Date filter */}
        <View className="flex-row gap-2 mb-4">
          {PRESETS.map((days) => (
            <Pressable
              key={days}
              onPress={() => setPreset(days)}
              className={`px-4 py-2 rounded-full border ${preset === days ? "bg-primary border-primary" : "bg-card border-muted"}`}
            >
              <Text className={`text-sm font-semibold ${preset === days ? "text-background" : "text-primary/60"}`}>
                {t("days_short", { count: days })}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.scheduled_time}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View className="bg-card border border-primary/20 rounded-2xl mb-4 overflow-hidden">
            <View className="bg-primary px-4 py-3">
              <Text className="text-background text-lg font-bold">{t("record_summary")}</Text>
            </View>

            <View className="border-t border-primary/10">
              <View className="flex-row items-center gap-2 px-4 py-2 bg-primary/5">
                <Ionicons name="medical-outline" size={18} color={brandColor} />
                <Text className="text-primary font-semibold">{t("medications")}</Text>
              </View>
              {summary.med ? (
                <>
                  <View className="px-4 py-3">
                    <Text className="text-primary"><Text className="font-semibold">{t("doses_taken_label")}: </Text>{summary.med.doses} {t("doses_unit")}</Text>
                    {summary.med.adherence !== null && (
                      <Text className="text-primary"><Text className="font-semibold">{t("adherence_label")}: </Text>{summary.med.adherence}%</Text>
                    )}
                  </View>
                  {summary.med.names.length > 0 && (
                    <View className="px-4 py-3 border-t border-primary/10">
                      <Text className="text-primary font-semibold mb-1">{t("medicine_list_label")}:</Text>
                      {summary.med.names.map((n) => (
                        <Text key={n} className="text-primary">{n}</Text>
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <View className="px-4 py-3"><Text className="text-primary/50">{t("no_data_found")}</Text></View>
              )}
            </View>

            <View className="border-t border-primary/10">
              <View className="flex-row items-center gap-2 px-4 py-2 bg-primary/5">
                <Ionicons name="heart-outline" size={18} color={brandColor} />
                <Text className="text-primary font-semibold">{t("measurement_bp")}</Text>
              </View>
              {summary.bp ? (
                <>
                  <View className="px-4 py-3">
                    <Text className="text-primary"><Text className="font-semibold">{t("bp_count_label")}: </Text>{summary.bp.count} {t("count_unit")}</Text>
                    {summary.bp.adherence !== null && (
                      <Text className="text-primary"><Text className="font-semibold">{t("adherence_label")}: </Text>{summary.bp.adherence}%</Text>
                    )}
                  </View>
                  {summary.bp.avg && (
                    <View className="px-4 py-3 border-t border-primary/10">
                      <Text className="text-primary"><Text className="font-semibold">{t("bp_average")}: </Text>{summary.bp.avg} mmHg</Text>
                    </View>
                  )}
                </>
              ) : (
                <View className="px-4 py-3"><Text className="text-primary/50">{t("no_data_found")}</Text></View>
              )}
            </View>

            <View className="border-t border-primary/10">
              <View className="flex-row items-center gap-2 px-4 py-2 bg-primary/5">
                <Ionicons name="water-outline" size={18} color={brandColor} />
                <Text className="text-primary font-semibold">{t("measurement_bs")}</Text>
              </View>
              {summary.bs ? (
                <>
                  <View className="px-4 py-3">
                    <Text className="text-primary"><Text className="font-semibold">{t("bs_count_label")}: </Text>{summary.bs.count} {t("count_unit")}</Text>
                    {summary.bs.adherence !== null && (
                      <Text className="text-primary"><Text className="font-semibold">{t("adherence_label")}: </Text>{summary.bs.adherence}%</Text>
                    )}
                  </View>
                  {summary.bs.avg && (
                    <View className="px-4 py-3 border-t border-primary/10">
                      <Text className="text-primary"><Text className="font-semibold">{t("bs_average")}: </Text>{summary.bs.avg} mg/dL</Text>
                    </View>
                  )}
                </>
              ) : (
                <View className="px-4 py-3"><Text className="text-primary/50">{t("no_data_found")}</Text></View>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text className="text-center mt-16 text-primary/40 text-base">{t("no_records_yet")}</Text>
        }
        renderSectionHeader={({ section }) => (
          <View className="py-2 mt-2">
            <Text className="text-sm font-bold text-primary/40">{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const overall = groupOverallStatus(item.entries);
          return (
            <View className="bg-card border border-primary/20 rounded-2xl mb-3 overflow-hidden">
              {/* Time header */}
              <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
                <Text className="text-primary font-bold text-lg">{item.scheduled_time}</Text>
                <StatusBadge status={overall} />
              </View>
              {/* Entries */}
              {item.entries.map((entry) => {
                const isMeasurement = entry.status === "recorded" || (entry.kind && entry.kind !== "medication");
                return (
                <View key={entry.id} className="flex-row items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0">
                  <Text className="text-primary text-base flex-1" numberOfLines={1}>
                    {entry.medicine_name ?? `Med #${entry.medication_id}`}
                  </Text>
                  {isMeasurement ? (
                    <View className="flex-row items-center gap-1 px-2 py-1 rounded-full bg-blue-50">
                      <Text className="text-xs font-semibold text-blue-700">{entry.value ?? "-"}</Text>
                    </View>
                  ) : (
                  <View className={`flex-row items-center gap-1 px-2 py-1 rounded-full ${entry.status === "taken" ? "bg-green-50" : "bg-red-50"}`}>
                    <Ionicons
                      name={entry.status === "taken" ? "checkmark-circle" : "close-circle"}
                      size={14}
                      color={entry.status === "taken" ? "#16a34a" : "#dc2626"}
                    />
                    <Text className={`text-xs font-medium ${entry.status === "taken" ? "text-green-700" : "text-red-600"}`}>
                      {entry.status === "taken" ? t("medication_taken") : t("medication_skipped")}
                    </Text>
                  </View>
                  )}
                </View>
                );
              })}
            </View>
          );
        }}
      />
    </View>
  );
}
