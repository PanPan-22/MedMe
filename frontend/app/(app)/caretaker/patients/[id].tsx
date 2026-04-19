import { Schedule } from "@/components/local-db";
import { useBrandColor } from "@/hooks/use-brand-color";
import { getUpcomingSlots, slotDayLabelKey, UpcomingSlot } from "@/lib/med-sort";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  router,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
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

export default function PatientDetailScreen() {
  const { id, patientName } = useLocalSearchParams<{
    id: string;
    patientName: string;
  }>();
  const { t } = useTranslation();
  const { primary: brandColor, background } = useBrandColor();
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const cardWidth = width - 32;

  const [slots, setSlots] = useState<UpcomingSlot[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [patientImage, setPatientImage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      db.getAllAsync<Schedule>(
        "SELECT * FROM schedules WHERE patient_id = ?",
        [parseInt(id)],
      ).then((meds) => setSlots(getUpcomingSlots(meds)));
      db.getFirstAsync<{ image_uri: string | null }>(
        "SELECT image_uri FROM patients WHERE id = ?",
        [parseInt(id)],
      ).then((row) => setPatientImage(row?.image_uri ?? null));
    }, [id]),
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{ headerShown: true, title: patientName ?? t("patient_default_label") }}
      />

      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            {/* Patient info */}
            <View className="items-center mb-6 gap-2">
              <Pressable
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                onPress={() => router.back()}
                className="self-start mb-2"
              >
                <Ionicons
                  name="arrow-back-outline"
                  size={24}
                  color={brandColor}
                />
              </Pressable>
              {patientImage ? (
                <Image
                  source={{ uri: patientImage }}
                  className="w-32 h-32 rounded-full"
                  resizeMode="cover"
                />
              ) : (
                <View className="w-32 h-32 rounded-full bg-primary/10 items-center justify-center">
                  <Text className="text-primary font-bold text-5xl">
                    {(patientName ?? "?").charAt(0)}
                  </Text>
                </View>
              )}
              <Text className="text-3xl font-bold text-primary mt-1">
                {patientName}
              </Text>
            </View>

            {/* Upcoming schedule carousel */}
            <Text className="text-lg font-bold text-primary mb-3">
              {t("next_med")}
            </Text>
            {slots.length > 0 ? (
              <View className="mb-6">
                <FlatList
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  data={slots}
                  keyExtractor={(item) => `${item.dayOffset}-${item.time}`}
                  onMomentumScrollEnd={(e) => {
                    setActiveIndex(
                      Math.round(e.nativeEvent.contentOffset.x / cardWidth),
                    );
                  }}
                  renderItem={({ item }) => {
                    const hour = parseInt(item.time.split(":")[0]);
                    const isNight = hour < 6 || hour >= 18;
                    const dayKey = slotDayLabelKey(item.dayOffset);
                    return (
                      <View
                        style={{ width: cardWidth }}
                        className="bg-card border border-primary/20 rounded-2xl overflow-hidden"
                      >
                        {/* Time pill */}
                        <View className="items-center pt-4">
                          <View className={`flex-row items-center gap-2 rounded-full px-4 py-1 ${isNight ? "bg-blue-100" : "bg-yellow-100"}`}>
                            {dayKey && (
                              <Text className="text-black font-semibold text-sm">{t(dayKey)}</Text>
                            )}
                            <Ionicons
                              name={isNight ? "moon" : "sunny"}
                              size={20}
                              color={isNight ? "#3b82f6" : "#f59e0b"}
                            />
                            <Text className="text-black font-bold text-2xl">{item.time}</Text>
                          </View>
                        </View>

                        {/* Med rows */}
                        <View className="px-2 pt-3 pb-2">
                          {item.meds.map((med) => {
                            const kind = med.kind ?? "medication";
                            return (
                              <View key={med.id} className="flex-row items-center justify-between border-t border-primary/10 px-2 py-3">
                                <View className="flex-1 mr-3">
                                  <Text className="text-primary font-bold text-base" numberOfLines={1}>{med.medicine_name}</Text>
                                  {kind === "medication" && (
                                    <Text className="text-primary/60 text-xs">{t("amount")}: {med.count} {med.type}</Text>
                                  )}
                                </View>
                                {kind === "medication" ? (
                                  med.image_uri ? (
                                    <Image source={{ uri: med.image_uri }} className="w-11 h-11 rounded-xl" resizeMode="cover" />
                                  ) : (
                                    <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center">
                                      <Ionicons name="medical-outline" size={22} color={brandColor} />
                                    </View>
                                  )
                                ) : (
                                  <View className="w-11 h-11 rounded-xl items-center justify-center">
                                    <Ionicons
                                      name={kind === "blood_pressure" ? "heart-outline" : "water-outline"}
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
              onPress={() =>
                router.push({
                  pathname: "/management",
                  params: { patientId: id, patientName: patientName ?? "" },
                })
              }
            >
              <Ionicons name="medical-outline" size={24} color={background} />
              <Text className="text-background text-xl font-semibold">
                {t("medicine_management")}
              </Text>
            </Pressable>
            <Pressable
              className="active:opacity-70 flex-row items-center justify-center gap-3 bg-primary rounded-xl p-4 w-full"
              onPress={() =>
                router.push({
                  pathname: "/record",
                  params: { patientId: id, patientName: patientName ?? "" },
                })
              }
            >
              <Ionicons name="clipboard-outline" size={24} color={background} />
              <Text className="text-background text-xl font-semibold">
                {t("record")}
              </Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}
