import { clearDatabase, Medication } from "@/components/local-db";
import { Feather } from "@expo/vector-icons";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { Link, router, Stack, useFocusEffect } from "expo-router";
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

// interface Medication {
//   id: number;
//   name: string;
//   amount: number;
//   time: string;
//   note: string;
// }

export default function ManagementScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [text, setText] = useState("");
  const [dbEmpty, setDbEmpty] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchMeds();
    }, []),
  );

  const searchMedicine = async (query: string) => {
    if (!query.trim()) {
      fetchMeds();
      return;
    }
    // setLoading(true)
    try {
      const searchResult = await db.getAllAsync<Medication>(
        `SELECT * FROM schedules WHERE medicine_name LIKE ?`,
        [`%${query}%`],
      );
      setMeds(searchResult);
    } catch (inconvenience) {
      console.log("Inconvenience: ", inconvenience);
    } finally {
      // setLoading(false)
    }
  };

  const handleSearch = (query: string) => {
    setText(query);
    //searchPatient(query);
    searchMedicine(query);
  };

  const clearAllMeds = async () => {
    try {
      // 1. Always safe: Clear your main data
      await db.execAsync("DELETE FROM schedule;");

      // 2. Only reset the ID counter if the sequence table actually exists
      await db
        .execAsync(
          `
      DELETE FROM sqlite_sequence WHERE name='schedule';
    `,
        )
        .catch((e) => {
          // We ignore this error because it just means
          // the sequence table hasn't been created yet.
          console.log("sqlite_sequence not found, skipping reset.");
        });

      alert("Database cleared!");
    } catch (error) {
      console.error("Error clearing database:", error);
    }
  };

  const fetchMeds = async () => {
    try {
      const allRows = await db.getAllAsync<Medication>(
        "SELECT * FROM schedules",
      );
      setMeds(allRows);
      setDbEmpty(allRows.length === 0);
    } catch (error) {
      console.error("Error fetching medications:", error);
    }
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
            await clearDatabase(db);
            await fetchMeds();
          },
        },
      ],
    );
  };

  const insets = useSafeAreaInsets();

  return (
    <View className="bg-background pt-4 px-4 h-full">
      <View className="items-center">
        <Stack.Screen options={{ headerShown: true, title: "Management" }} />
        <View className="flex-row items-center justify-between p-2 mb-4 w-full">
          <View className="flex-row items-center gap-4">
            <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
              <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
            </Pressable>
            <Text className="text-2xl font-bold text-primary">{t("your_medication")}</Text>
          </View>
          <Link href="/add-schedule" push asChild>
            <Pressable>
              <Ionicons name="add-circle-outline" size={32} color={colors.text} />
            </Pressable>
          </Link>
        </View>
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

      <View className="w-full">
        <FlatList
          data={meds}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            <Text className="text-center mt-10 text-primary/50">
              {t("no_medications")}
            </Text>
          }
          renderItem={({ item, index }) => (
            <Link href={`/management/${item.id}`} push asChild>
              <Pressable
                className="p-2 border-b w-full border-gray-200 flex-row items-center justify-between"
              >
                <Text
                  className="text-xl text-primary truncate w-4/5"
                  numberOfLines={1}
                >
                  {item.medicine_name}
                </Text>
                <Image
                  style={{ width: 50, height: 50, borderRadius: 5 }}
                  source={require("@/assets/images/tempura.jpg")}
                />
              </Pressable>
            </Link>
          )}
        />
      </View>

      {!dbEmpty && (
        <View
          className="items-center mt-8"
          style={{ paddingBottom: insets.bottom }}
        >
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
