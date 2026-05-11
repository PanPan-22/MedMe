import { Schedule } from "@/components/local-db";
import { useBrandColor } from "@/hooks/use-brand-color";
import { daysLeftForMed, getNextAlarm, isLowStock, slotDayLabelKey } from "@/lib/med-sort";
import { useSecureStorage } from "@/hooks/use-securestore";
import { useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Link, Redirect, router, Stack, useFocusEffect } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Image, Pressable, RefreshControl, Text, useWindowDimensions, View } from "react-native";

interface AlarmMed { medicine_name: string; count: number; type: string; image_uri?: string; kind?: string }
interface Patient { id: number; name: string; image_uri?: string; medsAtAlarm: AlarmMed[] }

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CaretakerHome() {
  const { t } = useTranslation();
  const { background, primary } = useBrandColor();
  const db = useSQLiteContext();
  const { user } = useUser();
  const { width } = useWindowDimensions();
  const cardWidth = width - 32;

  const role = (user?.unsafeMetadata as any)?.role;
  if (role && role !== "caretaker") return <Redirect href="/patient" />;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [nextAlarm, setNextAlarm] = useState<{ time: string; dayOffset: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lowStock, setLowStock] = useState<{ id: number; medicine_name: string; patientName: string; daysLeft: number }[]>([]);
  const [debugNotifications, setDebugNotifications] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { getValue } = useSecureStorage();

  useFocusEffect(useCallback(() => {
    fetchData();
    getValue("debugNotifications").then((v) => setDebugNotifications(v === "true"));
    const id = setInterval(fetchData, 10_000);
    return () => clearInterval(id);
  }, []));

  // Hide the splash once this home screen has mounted (smooth handoff).
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => { /* already hidden */ });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchData(); } finally { setRefreshing(false); }
  }, []);

  const fetchData = async () => {
    const pts = await db.getAllAsync<{ id: number; name: string; image_uri?: string }>("SELECT * FROM patients");
    const allMeds = await db.getAllAsync<Schedule>("SELECT * FROM schedules WHERE patient_id IS NOT NULL");
    const alarm = getNextAlarm(allMeds);
    setNextAlarm(alarm);

    const alarmDayName = alarm
      ? DAY_NAMES[(new Date().getDay() + alarm.dayOffset) % 7]
      : null;
    const enriched: Patient[] = pts.map(p => {
      const medsAtAlarm = alarm && alarmDayName
        ? allMeds.filter(m =>
            m.patient_id === p.id &&
            m.repeat_days?.includes(alarmDayName) &&
            (m.whenToTake ?? "").split(",").map(s => s.trim()).includes(alarm.time)
          ).map(m => ({ medicine_name: m.medicine_name, count: m.count, type: m.type, image_uri: m.image_uri, kind: m.kind }))
        : [];
      return { ...p, medsAtAlarm };
    }).filter(p => p.medsAtAlarm.length > 0);

    setPatients(enriched);

    const patientNameById = new Map(pts.map(p => [p.id, p.name]));
    const lowStockRows = allMeds
      .filter(isLowStock)
      .map(m => ({
        id: m.id,
        medicine_name: m.medicine_name,
        patientName: patientNameById.get(m.patient_id ?? -1) ?? "",
        daysLeft: daysLeftForMed(m) ?? 0,
      }));
    setLowStock(lowStockRows);
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true }} />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={primary}
          />
        }
        ListHeaderComponent={
          <>
            {/* Upcoming alarm */}
            <View className="flex-row items-center justify-between mb-5">
              <Text
                className="text-2xl font-bold text-primary flex-1 mr-2"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {t("next_med")}
              </Text>
              {nextAlarm ? (() => {
                const hour = parseInt(nextAlarm.time.split(":")[0]);
                const isNight = hour < 6 || hour >= 18;
                const dayKey = slotDayLabelKey(nextAlarm.dayOffset);
                return (
                  <View className={`flex-row items-center gap-2 rounded-full px-4 py-1.5 border ${isNight ? "bg-blue-100 border-blue-300" : "bg-yellow-100 border-yellow-300"}`}>
                    {dayKey && <Text className="text-black font-semibold text-sm">{t(dayKey)}</Text>}
                    <Ionicons name={isNight ? "moon" : "sunny"} size={20} color={isNight ? "#3b82f6" : "#f59e0b"} />
                    <Text className="text-black font-bold text-2xl">{nextAlarm.time}</Text>
                  </View>
                );
              })() : (
                <Text className="text-primary/50">{t("no_medications")}</Text>
              )}
            </View>

            {/* Low stock warning */}
            {lowStock.length > 0 && (
              <View className="mb-5 bg-yellow-100 border border-yellow-300 rounded-2xl p-4 gap-3">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="warning" size={20} color="#b45309" />
                  <Text className="text-black font-bold text-base">{t("low_stock")}</Text>
                </View>
                <View className="gap-2">
                  {lowStock.map((m) => {
                    const critical = m.daysLeft <= 3;
                    return (
                      <View key={m.id} className="flex-row items-center gap-3 bg-white/60 rounded-xl px-3 py-2.5">
                        <View className="w-9 h-9 rounded-full bg-yellow-200 items-center justify-center">
                          <Ionicons name="medical" size={18} color="#b45309" />
                        </View>
                        <View className="flex-1">
                          <Text className="text-black font-semibold text-sm" numberOfLines={1}>
                            {m.medicine_name}
                          </Text>
                          {m.patientName ? (
                            <Text className="text-black/60 text-xs" numberOfLines={1}>
                              {m.patientName}
                            </Text>
                          ) : null}
                        </View>
                        <View className={`px-2.5 py-1 rounded-full ${critical ? "bg-red-500" : "bg-amber-500"}`}>
                          <Text className="text-white font-bold text-xs">{t("days_short", { count: m.daysLeft })}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Empty state */}
            {patients.length === 0 && (
              <View className="items-center justify-center py-10 gap-3 mb-5 bg-card border border-primary/20 rounded-2xl">
                <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center">
                  <Ionicons name="people-outline" size={40} color={primary} />
                </View>
                <Text className="text-primary/60 text-base text-center px-6">{t("no_medications")}</Text>
              </View>
            )}

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
                        <View className="flex-row items-center gap-4 flex-1">
                          {item.image_uri ? (
                            <Image source={{ uri: item.image_uri }} className="w-16 h-16 rounded-full" resizeMode="cover" />
                          ) : (
                            <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center">
                              <Text className="text-primary font-bold text-2xl">{item.name.charAt(0)}</Text>
                            </View>
                          )}
                          <Text className="text-lg font-bold text-primary flex-1" numberOfLines={1}>{item.name}</Text>
                        </View>
                        <Pressable
                          className="active:opacity-70 p-1"
                          onPress={() => router.push({ pathname: "/caretaker/patients/[id]", params: { id: item.id, patientName: item.name } })}
                        >
                          <Ionicons name="information-circle-outline" size={26} color={primary} />
                        </Pressable>
                      </View>

                      {/* Medication list */}
                      {item.medsAtAlarm.map((med, i) => {
                        const kind = med.kind ?? "medication";
                        const isMeasurement = kind !== "medication";
                        return (
                          <View key={i} className="flex-row items-center justify-between border-t border-primary/20 px-4 py-3">
                            <View className="flex-1 mr-3">
                              <Text className="text-primary font-semibold text-sm" numberOfLines={1}>{med.medicine_name}</Text>
                              {!isMeasurement && (
                                <Text className="text-primary/50 text-xs">{t("amount")}: {med.count} {t(`type_${med.type?.toLowerCase()}`, { defaultValue: med.type })}</Text>
                              )}
                            </View>
                            {isMeasurement ? (
                              <View className="w-11 h-11 rounded-xl items-center justify-center">
                                <Ionicons name={kind === "blood_pressure" ? "heart-outline" : "water-outline"} size={26} color="#dc2626" />
                              </View>
                            ) : med.image_uri ? (
                              <Image source={{ uri: med.image_uri }} className="w-11 h-11 rounded-xl" resizeMode="cover" />
                            ) : (
                              <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center">
                                <Ionicons name="medical-outline" size={22} color={primary} />
                              </View>
                            )}
                          </View>
                        );
                      })}
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
            {debugNotifications && (
              <Link href="/debug-notifications" push asChild>
                <Pressable className="active:opacity-70 flex-row items-center justify-center gap-3 bg-primary/10 rounded-xl p-4 w-full">
                  <Ionicons name="notifications-outline" size={24} color={primary} />
                  <Text className="text-primary text-base font-semibold">Debug: Scheduled Notifications</Text>
                </Pressable>
              </Link>
            )}
          </View>
        }
      />
    </View>
  );
}
