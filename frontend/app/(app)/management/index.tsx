import { clearDatabase, Medication } from "@/components/local-db";
import { cancelNotificationsForMed } from "@/hooks/use-notifications";
import { Feather } from "@expo/vector-icons";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ManagementScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { patientId, patientName } = useLocalSearchParams<{ patientId?: string; patientName?: string }>();

  const pid = patientId ? parseInt(patientId) : null;
  const title = patientName ?? t("your_medication");

  const [meds, setMeds] = useState<Medication[]>([]);
  const [text, setText] = useState("");
  const [dbEmpty, setDbEmpty] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchMeds();
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
      setDbEmpty(allRows.length === 0);
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

  const alertClearDatabase = () => {
    Alert.alert(
      t("clear_database"),
      t("clear_confirm"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("clear"),
          style: "destructive",
          onPress: async () => {
            const query = pid !== null
              ? "SELECT notification_id FROM schedules WHERE patient_id = ?"
              : "SELECT notification_id FROM schedules WHERE patient_id IS NULL";
            const rows = await db.getAllAsync<{ notification_id: string }>(query, pid !== null ? [pid] : []);
            for (const row of rows) {
              if (row.notification_id) await cancelNotificationsForMed(row.notification_id);
            }
            const deleteQuery = pid !== null
              ? "DELETE FROM schedules WHERE patient_id = ?"
              : "DELETE FROM schedules WHERE patient_id IS NULL";
            await db.runAsync(deleteQuery, pid !== null ? [pid] : []);
            await fetchMeds();
          },
        },
      ],
    );
  };

  const addScheduleHref = pid !== null
    ? { pathname: "/add-schedule" as const, params: { patientId: pid, patientName: patientName ?? "" } }
    : { pathname: "/add-schedule" as const };

  return (
    <View className="bg-background pt-4 px-4 h-full">
      <Stack.Screen options={{ headerShown: true, title: "Management" }} />

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

      <View className="flex-row items-center gap-2 px-3 w-full bg-white border border-gray-300 rounded-full mb-4">
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
              className="p-2 border-b w-full border-gray-200 flex-row items-center justify-between active:opacity-70"
              onPress={() => router.push({
                pathname: `/management/${item.id}`,
                params: pid !== null ? { patientId: pid, patientName: patientName ?? "" } : {},
              })}
            >
              <Text className="text-xl text-primary truncate w-4/5" numberOfLines={1}>
                {item.medicine_name}
              </Text>
              <Image
                style={{ width: 50, height: 50, borderRadius: 5 }}
                source={require("@/assets/images/tempura.jpg")}
              />
            </Pressable>
          )}
        />
      </View>

      {!dbEmpty && (
        <View className="items-center mt-4 mb-4" style={{ paddingBottom: insets.bottom }}>
          <Pressable
            className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-60 shadow-sm"
            onPress={alertClearDatabase}
          >
            <Text className="text-2xl font-bold text-background">{t("clear")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
