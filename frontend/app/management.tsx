import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { Link, Stack, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

interface Medication {
  id: number;
  name: string;
  amount: number;
  time: string;
  note: string;
}

export default function ManagementScreen() {
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const [meds, setMeds] = useState<Medication[]>([]);

  useFocusEffect(
    useCallback(() => {
      fetchMeds();
    }, []),
  );

  const clearAllMeds = async () => {
    try {
      await db.execAsync("DELETE FROM schedule;");
      // If you are using an ID with AUTOINCREMENT and want it to reset to 1:
      await db.execAsync("DELETE FROM sqlite_sequence WHERE name='schedule';");

      alert("Database cleared!");
      // If you are on the list screen, call your fetch function here to refresh
    } catch (error) {
      console.error("Error clearing database:", error);
    }
  };

  const fetchMeds = async () => {
    try {
      // getAllAsync returns an array of objects
      const allRows = await db.getAllAsync<Medication>(
        "SELECT * FROM schedule",
      );
      setMeds(allRows);
    } catch (error) {
      console.error("Error fetching medications:", error);
    }
  };

  return (
    <View className="bg-background p-2 h-full">
      <View className="items-center">
        <Stack.Screen options={{ headerShown: true, title: "Management" }} />
        <View className="flex-row items-center justify-between border border-primary gap-4 p-2 mb-4 w-full">
          <Text className="text-2xl text-primary">Your Medication</Text>
          <Link href="/add-schedule" push asChild>
            <Pressable className="flex-row items-center justify-center">
              <Ionicons
                name="add-circle-outline"
                size={32}
                color={colors.text}
              />
            </Pressable>
          </Link>
        </View>
      </View>
      <View className="flex-1 bg-background p-4">
        <FlatList
          data={meds}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            <Text className="text-center mt-10 text-gray-500">
              No medications added yet.
            </Text>
          }
          renderItem={({ item }) => (
            <View className="bg-white p-4 mb-3 rounded-2xl border border-primary/20 shadow-sm">
              <View className="flex-row justify-between items-center">
                <Text className="text-xl font-bold text-primary">
                  {item.name}
                </Text>
                <Text className="text-secondary font-semibold">
                  {item.time}
                </Text>
              </View>
              <Text className="text-gray-600 mt-1">Amount: {item.amount}</Text>
              {item.note ? (
                <Text className="text-gray-400 italic mt-2 text-sm">
                  "{item.note}"
                </Text>
              ) : null}
            </View>
          )}
        />
      </View>
      <View className="items-center mt-8">
        <Pressable
          className="items-center justify-center bg-primary rounded-xl p-4 w-60"
          onPress={async () => {
            clearAllMeds();
            // Optionally, you can also call fetchMeds() here to refresh the list immediately
            await fetchMeds();
          }}
        >
          <Text className="text-2xl text-white">Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}
