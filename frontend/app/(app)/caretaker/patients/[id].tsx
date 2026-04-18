import { Medication } from "@/components/local-db";
import TimeComponent from "@/components/time-component";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, Text, useWindowDimensions, View } from "react-native";

interface TimeSlot { time: string; meds: Medication[] }

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export default function PatientDetailScreen() {
  const { id, patientName, patientAge } = useLocalSearchParams<{ id: string; patientName: string; patientAge: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const cardWidth = width - 32;

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useFocusEffect(useCallback(() => {
    db.getAllAsync<Medication>("SELECT * FROM schedules WHERE patient_id = ?", [parseInt(id)])
      .then((meds) => setSlots(getUpcomingSlots(meds)));
  }, [id]));

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: patientName ?? "Patient" }} />

      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            {/* Patient info */}
            <View className="items-center mb-6 gap-2">
              <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()} className="self-start mb-2">
                <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
              </Pressable>
              <Ionicons name="person-circle-outline" size={96} color={colors.primary} />
              <Text className="text-2xl font-bold text-primary">{patientName}</Text>
              {patientAge ? <Text className="text-primary/50">{patientAge} {t("years_old") ?? "years old"}</Text> : null}
            </View>

            {/* Upcoming schedule carousel */}
            <Text className="text-lg font-bold text-primary mb-3">{t("next_med")}</Text>
            {slots.length > 0 ? (
              <View className="mb-6">
                <FlatList
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  data={slots}
                  keyExtractor={(item) => item.time}
                  onMomentumScrollEnd={(e) => {
                    setActiveIndex(Math.round(e.nativeEvent.contentOffset.x / cardWidth));
                  }}
                  renderItem={({ item }) => (
                    <View style={{ width: cardWidth }} className="bg-primary rounded-2xl p-6 gap-3">
                      <Text className="text-white/70 text-sm font-medium">{t("schedule")}</Text>
                      <TimeComponent time={item.time} />
                      <View className="gap-1">
                        {item.meds.map((med) => (
                          <View key={med.id} className="flex-row items-center gap-2">
                            <Ionicons name="ellipse" size={8} color="rgba(255,255,255,0.7)" />
                            <Text className="text-white/90 text-base" numberOfLines={1}>{med.medicine_name}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                />
                {slots.length > 1 && (
                  <View className="flex-row justify-center gap-2 mt-3">
                    {slots.map((_, i) => (
                      <View key={i} className={`rounded-full ${i === activeIndex ? "w-3 h-3 bg-primary" : "w-2 h-2 bg-primary/30"}`} />
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View className="bg-primary/10 rounded-2xl p-6 mb-6 items-center">
                <Text className="text-primary/50">{t("no_medications")}</Text>
              </View>
            )}
          </>
        }
        ListFooterComponent={
          <View className="gap-3">
            <Pressable
              className="active:opacity-70 flex-row items-center justify-center gap-3 bg-primary rounded-xl p-4 w-full"
              onPress={() => router.push({ pathname: "/management", params: { patientId: id, patientName: patientName ?? "" } })}
            >
              <Ionicons name="medical-outline" size={24} color="white" />
              <Text className="text-white text-xl font-semibold">{t("medicine_management")}</Text>
            </Pressable>
            <Pressable
              className="active:opacity-70 flex-row items-center justify-center gap-3 bg-primary rounded-xl p-4 w-full"
              onPress={() => router.push({ pathname: "/record", params: { patientId: id, patientName: patientName ?? "" } })}
            >
              <Ionicons name="clipboard-outline" size={24} color="white" />
              <Text className="text-white text-xl font-semibold">{t("record")}</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}
