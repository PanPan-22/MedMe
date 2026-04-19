import { Medication } from "@/components/local-db";
import { useBrandColor } from "@/hooks/use-brand-color";
import { useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { Link, Redirect, router, Stack, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Image, Pressable, Text, useWindowDimensions, View } from "react-native";

interface AlarmMed { medicine_name: string; count: number; type: string; image_uri?: string }
interface Patient { id: number; name: string; image_uri?: string; medsAtAlarm: AlarmMed[] }

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getNextAlarm(meds: Medication[]): { time: string } | null {
  const today = DAY_NAMES[new Date().getDay()];
  const now = new Date();
  const current = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  const times: string[] = [];
  for (const med of meds) {
    if (!med.repeat_days?.includes(today)) continue;
    for (const t of (med.whenToTake ?? "").split(",").filter(Boolean)) {
      if (t > current) times.push(t);
    }
  }
  if (!times.length) return null;
  return { time: times.sort()[0] };
}

export default function CaretakerHome() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { background, primary } = useBrandColor();
  const db = useSQLiteContext();
  const { user } = useUser();
  const { width } = useWindowDimensions();
  const cardWidth = width - 32;

  const role = (user?.unsafeMetadata as any)?.role;
  if (role && role !== "caretaker") return <Redirect href="/patient" />;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [nextAlarm, setNextAlarm] = useState<{ time: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useFocusEffect(useCallback(() => { fetchData(); }, []));

  const fetchData = async () => {
    const pts = await db.getAllAsync<{ id: number; name: string; image_uri?: string }>("SELECT * FROM patients");
    const allMeds = await db.getAllAsync<Medication>("SELECT * FROM schedules WHERE patient_id IS NOT NULL");
    const alarm = getNextAlarm(allMeds);
    setNextAlarm(alarm);

    const today = DAY_NAMES[new Date().getDay()];
    const enriched: Patient[] = pts.map(p => {
      const medsAtAlarm = alarm
        ? allMeds.filter(m =>
            m.patient_id === p.id &&
            m.repeat_days?.includes(today) &&
            (m.whenToTake ?? "").split(",").map(s => s.trim()).includes(alarm.time)
          ).map(m => ({ medicine_name: m.medicine_name, count: m.count, type: m.type, image_uri: m.image_uri }))
        : [];
      return { ...p, medsAtAlarm };
    }).filter(p => p.medsAtAlarm.length > 0);

    setPatients(enriched);
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true }} />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <>
            {/* Upcoming alarm */}
            <View className="flex-row items-center justify-between mb-5">
              <Text className="text-2xl font-bold text-primary flex-1" numberOfLines={1}>{t("next_med")}</Text>
              {nextAlarm ? (() => {
                const hour = parseInt(nextAlarm.time.split(":")[0]);
                const isNight = hour < 6 || hour >= 18;
                return (
                  <View className="flex-row items-center gap-2 bg-yellow-100 rounded-full px-4 py-1.5 border border-yellow-300">
                    <Ionicons name={isNight ? "moon" : "sunny"} size={20} color={isNight ? "#3b82f6" : "#f59e0b"} />
                    <Text className="text-primary font-bold text-2xl">{nextAlarm.time}</Text>
                  </View>
                );
              })() : (
                <Text className="text-primary/50">{t("no_medications")}</Text>
              )}
            </View>

            {/* Patient carousel — only patients with meds at alarm time */}
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
                    <View style={{ width: cardWidth }} className="bg-card border border-primary/20 rounded-2xl overflow-hidden">
                      {/* Patient header */}
                      <View className="flex-row items-center justify-between px-4 py-4">
                        <View className="flex-row items-center gap-3 flex-1">
                          {item.image_uri ? (
                            <Image source={{ uri: item.image_uri }} className="w-12 h-12 rounded-full" resizeMode="cover" />
                          ) : (
                            <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center">
                              <Text className="text-primary font-bold text-lg">{item.name.charAt(0)}</Text>
                            </View>
                          )}
                          <Text className="text-base font-bold text-primary flex-1" numberOfLines={1}>{item.name}</Text>
                        </View>
                        <Pressable
                          className="active:opacity-70 p-1"
                          onPress={() => router.push({ pathname: "/caretaker/patients/[id]", params: { id: item.id, patientName: item.name } })}
                        >
                          <Ionicons name="information-circle-outline" size={26} color={primary} />
                        </Pressable>
                      </View>

                      {/* Medication list */}
                      {item.medsAtAlarm.map((med, i) => (
                        <View key={i} className="flex-row items-center justify-between border-t border-primary/20 px-4 py-3">
                          <View className="flex-1 mr-3">
                            <Text className="text-primary font-semibold text-sm" numberOfLines={1}>{med.medicine_name}</Text>
                            <Text className="text-primary/50 text-xs">{t("amount")}: {med.count} {med.type}</Text>
                          </View>
                          {med.image_uri ? (
                            <Image source={{ uri: med.image_uri }} className="w-11 h-11 rounded-xl" resizeMode="cover" />
                          ) : (
                            <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center">
                              <Ionicons name="medical-outline" size={22} color={primary} />
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                />
                {patients.length > 1 && (
                  <View className="flex-row justify-center gap-2 mt-3">
                    {patients.map((_, i) => (
                      <View key={i} className={`w-2 h-2 rounded-full ${i === activeIndex ? "bg-primary" : "bg-gray-300"}`} />
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
                <Ionicons name="people-outline" size={28} color={background} />
                <Text className="text-background text-xl font-semibold">{t("patients")}</Text>
              </Pressable>
            </Link>
            <Link href="/debug-notifications" push asChild>
              <Pressable className="active:opacity-70 flex-row items-center justify-center gap-3 bg-primary/10 rounded-xl p-4 w-full">
                <Ionicons name="notifications-outline" size={24} color={primary} />
                <Text className="text-primary text-base font-semibold">Debug: Scheduled Notifications</Text>
              </Pressable>
            </Link>
          </View>
        }
      />
    </View>
  );
}
