import { Medication } from "@/components/local-db";
import { Feather } from "@expo/vector-icons";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

export default function ManagementScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const { patientId, patientName } = useLocalSearchParams<{ patientId?: string; patientName?: string }>();

  const pid = patientId ? parseInt(patientId) : null;
  const title = patientName ?? t("your_medication");

  const [meds, setMeds] = useState<Medication[]>([]);
  const [text, setText] = useState("");

  useFocusEffect(
    useCallback(() => {
      fetchMeds();
      const id = setInterval(fetchMeds, 3000);
      return () => clearInterval(id);
    }, [pid]),
  );

  const fetchMeds = async () => {
    try {
      const query = pid !== null
        ? "SELECT * FROM schedules WHERE patient_id = ?"
        : "SELECT * FROM schedules WHERE patient_id IS NULL";
      const args = pid !== null ? [pid] : [];
      const allRows = await db.getAllAsync<Medication>(query, args);
      setMeds(allRows);
    } catch (error) {
      console.error("Error fetching medications:", error);
    }
  };

  const searchMedicine = async (query: string) => {
    if (!query.trim()) { fetchMeds(); return; }
    try {
      const q = pid !== null
        ? "SELECT * FROM schedules WHERE medicine_name LIKE ? AND patient_id = ?"
        : "SELECT * FROM schedules WHERE medicine_name LIKE ? AND patient_id IS NULL";
      const args = pid !== null ? [`%${query}%`, pid] : [`%${query}%`];
      const searchResult = await db.getAllAsync<Medication>(q, args);
      setMeds(searchResult);
    } catch (e) {
      console.log("Search error:", e);
    }
  };

  const handleSearch = (query: string) => {
    setText(query);
    searchMedicine(query);
  };

  const addScheduleHref = pid !== null
    ? { pathname: "/add-schedule" as const, params: { patientId: pid, patientName: patientName ?? "" } }
    : { pathname: "/add-schedule" as const };

  return (
    <View className="bg-background pt-4 px-4 h-full">
      <Stack.Screen options={{ headerShown: true, title: t("management_title") }} />

      <View className="flex-row items-center justify-between p-2 mb-4 w-full">
        <View className="flex-row items-center gap-4 flex-1 mr-2">
          <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
          </Pressable>
          <Text className="text-2xl font-bold text-primary flex-1" numberOfLines={1}>{title}</Text>
        </View>
        <Pressable onPress={() => router.push(addScheduleHref)}>
          <Ionicons name="add-circle-outline" size={32} color={colors.text} />
        </Pressable>
      </View>

      <View className="flex-row items-center gap-2 px-3 w-full bg-card border border-muted rounded-full mb-4">
        <Feather name="search" size={24} color="black" />
        <TextInput
          value={text}
          onChangeText={handleSearch}
          placeholder={t("search_placeholder")}
          placeholderTextColor="#888888"
          className="px-1 py-3 flex-1 text-primary text-lg"
        />
      </View>

      <View className="w-full flex-1">
        <FlatList
          data={meds}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            <Text className="text-center mt-10 text-primary/50">{t("no_medications")}</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              className="p-2 border-b w-full border-muted flex-row items-center justify-between active:opacity-70"
              onPress={() => router.push({
                pathname: `/management/${item.id}`,
                params: pid !== null ? { patientId: pid, patientName: patientName ?? "" } : {},
              })}
            >
              <Text className="text-xl text-primary truncate w-4/5" numberOfLines={1}>
                {item.medicine_name}
              </Text>
              {item.image_uri ? (
                <Image
                  style={{ width: 50, height: 50, borderRadius: 8 }}
                  source={{ uri: item.image_uri }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ width: 50, height: 50, borderRadius: 8 }} className="bg-primary/10 items-center justify-center">
                  <Ionicons name="medical-outline" size={24} color={colors.primary} />
                </View>
              )}
            </Pressable>
          )}
        />
      </View>

    </View>
  );
}
