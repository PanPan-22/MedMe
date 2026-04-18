import { Medication } from "@/components/local-db";
import { useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { Link, Redirect, router, Stack, useFocusEffect } from "expo-router";

import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, Text, useWindowDimensions, View } from "react-native";

interface Patient { id: number; name: string; age: number; medCount?: number }

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getNextAlarm(meds: Medication[]): { time: string; names: string[] } | null {
  const today = DAY_NAMES[new Date().getDay()];
  const now = new Date();
  const current = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  const upcoming: { time: string; name: string }[] = [];
  for (const med of meds) {
    if (!med.repeat_days?.includes(today)) continue;
    for (const t of (med.whenToTake ?? "").split(",").filter(Boolean)) {
      if (t > current) upcoming.push({ time: t, name: med.medicine_name });
    }
  }
  if (!upcoming.length) return null;
  upcoming.sort((a, b) => a.time.localeCompare(b.time));
  const next = upcoming[0].time;
  return { time: next, names: upcoming.filter(u => u.time === next).map(u => u.name) };
}

export default function CaretakerHome() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const { user } = useUser();
  const { width } = useWindowDimensions();
  const cardWidth = width - 32;

  const role = (user?.unsafeMetadata as any)?.role;
  if (role && role !== "caretaker") return <Redirect href="/patient" />;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [nextAlarm, setNextAlarm] = useState<{ time: string; names: string[] } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const fetchData = async () => {
    const pts = await db.getAllAsync<Patient>("SELECT * FROM patients");
    const allMeds = await db.getAllAsync<Medication>("SELECT * FROM schedules WHERE patient_id IS NOT NULL");
    const countMap = new Map<number, number>();
    for (const m of allMeds) { if (m.patient_id != null) countMap.set(m.patient_id, (countMap.get(m.patient_id) ?? 0) + 1); }
    setPatients(pts.map(p => ({ ...p, medCount: countMap.get(p.id) ?? 0 })));
    setNextAlarm(getNextAlarm(allMeds));
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true }} />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <>
            {/* Upcoming alarm */}
            <View className="bg-primary rounded-2xl p-5 mb-5">
              <Text className="text-white/70 text-sm font-medium mb-1">{t("next_med")}</Text>
              {nextAlarm ? (
                <>
                  <Text className="text-white text-4xl font-bold mb-2">{nextAlarm.time}</Text>
                  <Text className="text-white/80 text-sm" numberOfLines={2}>
                    {nextAlarm.names.join(" · ")}
                  </Text>
                </>
              ) : (
                <Text className="text-white/60 text-base">{t("no_medications")}</Text>
              )}
            </View>

            {/* Patient carousel */}
            {patients.length > 0 && (
              <View className="mb-5">
                <Text className="text-lg font-bold text-primary mb-3">{t("patients")}</Text>
                <FlatList
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  data={patients}
                  keyExtractor={(item) => item.id.toString()}
                  onMomentumScrollEnd={(e) => {
                    setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / cardWidth));
                  }}
                  renderItem={({ item }) => (
                    <Pressable
                      style={{ width: cardWidth }}
                      className="active:opacity-70 bg-white border border-primary/10 rounded-2xl p-6 items-center gap-3"
                      onPress={() => router.push({ pathname: "/caretaker/patients/[id]", params: { id: item.id, patientName: item.name, patientAge: item.age } })}
                    >
                      <Ionicons name="person-circle-outline" size={72} color={colors.primary} />
                      <Text className="text-xl font-bold text-primary">{item.name}</Text>
                      <Text className="text-primary/50 text-sm">{item.age} {t("years_old")}</Text>
                      <View className="flex-row items-center gap-1 bg-primary/10 rounded-full px-3 py-1">
                        <Ionicons name="medical-outline" size={14} color={colors.primary} />
                        <Text className="text-primary text-sm font-medium">{item.medCount ?? 0} {t("medications")}</Text>
                      </View>
                    </Pressable>
                  )}
                />
                {patients.length > 1 && (
                  <View className="flex-row justify-center gap-2 mt-3">
                    {patients.map((_, i) => (
                      <View
                        key={i}
                        className={`rounded-full ${i === activeIndex ? "w-3 h-3 bg-primary" : "w-2 h-2 bg-primary/30"}`}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        }
        data={[]}
        renderItem={null}
        ListFooterComponent={
          <View className="gap-3">
            <Link href="/caretaker/patients" push asChild>
              <Pressable className="active:opacity-70 flex-row items-center justify-center gap-3 bg-primary rounded-xl p-4 w-full">
                <Ionicons name="people-outline" size={28} color="white" />
                <Text className="text-white text-xl font-semibold">{t("patients")}</Text>
              </Pressable>
            </Link>
            <Link href="/debug-notifications" push asChild>
              <Pressable className="active:opacity-70 flex-row items-center justify-center gap-3 bg-primary/10 rounded-xl p-4 w-full">
                <Ionicons name="notifications-outline" size={24} color="#062d13" />
                <Text className="text-primary text-base font-semibold">Debug: Scheduled Notifications</Text>
              </Pressable>
            </Link>
          </View>
        }
      />
    </View>
  );
}
