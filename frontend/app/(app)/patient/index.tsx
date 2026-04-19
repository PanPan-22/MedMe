import { Medication } from "@/components/local-db";
import { useBrandColor } from "@/hooks/use-brand-color";
import { useSecureStorage } from "@/hooks/use-securestore";
import { useUser } from "@clerk/expo";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Link, Redirect, Stack, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface TimeSlot {
  time: string;
  meds: Medication[];
}

function getUpcomingSlots(meds: Medication[], limit = 5): TimeSlot[] {
  const today = DAY_NAMES[new Date().getDay()];
  const now = new Date();
  const current = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  const map = new Map<string, Medication[]>();
  for (const med of meds) {
    if (!med.repeat_days?.includes(today)) continue;
    for (const t of (med.whenToTake ?? "").split(",").filter(Boolean)) {
      if (t > current) {
        if (!map.has(t)) map.set(t, []);
        map.get(t)!.push(med);
      }
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, limit)
    .map(([time, meds]) => ({ time, meds }));
}

export default function PatientHome() {
  const { t } = useTranslation();
  const { primary: brandColor, background } = useBrandColor();
  const db = useSQLiteContext();
  const { user } = useUser();
  const { width } = useWindowDimensions();
  const cardWidth = width - 32;

  const role = (user?.unsafeMetadata as any)?.role;
  if (role && role !== "patient") return <Redirect href="/caretaker" />;

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [simpleUi, setSimpleUi] = useState(false);
  const { getValue } = useSecureStorage();

  useFocusEffect(
    useCallback(() => {
      fetchData();
      getValue("simpleUi").then((v) => setSimpleUi(v === "true"));
    }, []),
  );

  const fetchData = async () => {
    const meds = await db.getAllAsync<Medication>(
      "SELECT * FROM schedules WHERE patient_id IS NULL",
    );
    setSlots(getUpcomingSlots(meds));
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true }} />
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            {/* Next medication header with yellow time pill */}
            <View className="flex-row items-center justify-between mb-5">
              <Text
                className="text-2xl font-bold text-primary flex-1"
                numberOfLines={1}
              >
                {t("next_med")}
              </Text>
              {slots.length > 0 ? (
                (() => {
                  const hour = parseInt(slots[0].time.split(":")[0]);
                  const isNight = hour < 6 || hour >= 18;
                  return (
                    <View className="flex-row items-center gap-2 bg-yellow-100 rounded-full px-4 py-1.5 border border-yellow-300">
                      <Ionicons
                        name={isNight ? "moon" : "sunny"}
                        size={20}
                        color={isNight ? "#3b82f6" : "#f59e0b"}
                      />
                      <Text className="text-primary font-bold text-2xl">
                        {slots[0].time}
                      </Text>
                    </View>
                  );
                })()
              ) : (
                <Text className="text-primary/50">{t("no_medications")}</Text>
              )}
            </View>

            {/* Upcoming meds carousel */}
            {slots.length > 0 && (
              <View className="mb-5">
                <FlatList
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  data={slots}
                  keyExtractor={(item) => item.time}
                  onMomentumScrollEnd={(e) => {
                    setActiveIndex(
                      Math.round(e.nativeEvent.contentOffset.x / cardWidth),
                    );
                  }}
                  renderItem={({ item }) => {
                    const hour = parseInt(item.time.split(":")[0]);
                    const isNight = hour < 6 || hour >= 18;
                    return (
                      <View
                        style={{ width: cardWidth }}
                        className="bg-card border border-primary/20 rounded-2xl overflow-hidden"
                      >
                        {/* Time pill on dark green header */}
                        <View className="bg-primary py-4 items-center">
                          <View className="flex-row items-center gap-2 bg-yellow-100 rounded-full px-4 py-1 border border-yellow-300">
                            <Ionicons
                              name={isNight ? "moon" : "sunny"}
                              size={20}
                              color={isNight ? "#3b82f6" : "#f59e0b"}
                            />
                            <Text className="text-primary font-bold text-2xl">
                              {item.time}
                            </Text>
                          </View>
                        </View>

                        {/* Med rows */}
                        <View className="px-2 pt-2 pb-2">
                          {item.meds.map((med, idx) => {
                            const kind = med.kind ?? "medication";
                            return (
                              <View
                                key={med.id}
                                className={`flex-row items-center justify-between px-2 py-3 ${idx > 0 ? "border-t border-primary/10" : ""}`}
                              >
                                <View className="flex-1 mr-3">
                                  <Text
                                    className="text-primary font-bold text-base"
                                    numberOfLines={1}
                                  >
                                    {med.medicine_name}
                                  </Text>
                                  {kind === "medication" && (
                                    <Text className="text-primary/60 text-xs">
                                      {t("amount")}: {med.count} {med.type}
                                    </Text>
                                  )}
                                </View>
                                {kind === "medication" ? (
                                  med.image_uri ? (
                                    <Image
                                      source={{ uri: med.image_uri }}
                                      className="w-11 h-11 rounded-xl"
                                      resizeMode="cover"
                                    />
                                  ) : (
                                    <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center">
                                      <Ionicons
                                        name="medical-outline"
                                        size={22}
                                        color={brandColor}
                                      />
                                    </View>
                                  )
                                ) : (
                                  <View className="w-11 h-11 rounded-xl items-center justify-center">
                                    <Ionicons
                                      name={
                                        kind === "blood_pressure"
                                          ? "heart-outline"
                                          : "water-outline"
                                      }
                                      size={26}
                                      color="#dc2626"
                                    />
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  }}
                />
                {slots.length > 1 && (
                  <View className="flex-row justify-center gap-2 mt-3">
                    {slots.map((_, i) => (
                      <View
                        key={i}
                        className={`w-2 h-2 rounded-full ${i === activeIndex ? "bg-primary" : "bg-gray-300"}`}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        }
        ListFooterComponent={
          <View className="gap-3">
            {!simpleUi && (
              <>
                <Link href="/debug-notifications" push asChild>
                  <Pressable className="active:opacity-70 flex-row items-center justify-center gap-3 bg-primary/10 rounded-xl p-4 w-full">
                    <Ionicons
                      name="notifications-outline"
                      size={24}
                      color="#062d13"
                    />
                    <Text className="text-primary text-base font-semibold">
                      Debug: Scheduled Notifications
                    </Text>
                  </Pressable>
                </Link>
                <Link href="/management" push asChild>
                  <Pressable className="active:opacity-70 flex-row items-center justify-center gap-3 bg-primary rounded-xl p-4 w-full">
                    <FontAwesome6 name="pills" size={24} color={background} />
                    <Text className="text-background text-xl font-semibold">
                      {t("medicine_management")}
                    </Text>
                  </Pressable>
                </Link>
              </>
            )}
            <Link href="/record" push asChild>
              <Pressable className="active:opacity-70 flex-row items-center justify-center gap-3 bg-primary rounded-xl p-4 w-full">
                <Ionicons
                  name="clipboard-outline"
                  size={24}
                  color={background}
                />
                <Text className="text-background text-xl font-semibold">
                  {t("record")}
                </Text>
              </Pressable>
            </Link>
          </View>
        }
      />
    </View>
  );
}
