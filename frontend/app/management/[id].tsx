import { Medication } from "@/components/local-db";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

export default function individualMedicationScreen() {
  console.log("Rendering individual medication screen");
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const id = useLocalSearchParams().id;
  // I got the ID, how do I get the medication with that ID from the database? I need to run a query like "SELECT * FROM medications WHERE id = ?", but how do I do that with expo-sqlite? I think I can use db.getAsync, but I'm not sure how to pass the parameter. Let's try this:
  //const [medication, setMedication] = useState<Medication | null>(null);
  const [med, setMed] = useState<Medication>();
  const fetchMedication = async () => {
    try {
      const result = await db.getFirstAsync(
        "SELECT * FROM schedules WHERE id = ?",
        [id.toString()],
      );
      console.log("Query result:", result);
      console.log(typeof result);
      setMed(result as Medication);
    } catch (error) {
      console.error("Skill issues", error);
    }
  };

  useEffect(() => {
    console.log("Fetching medication with ID:", id);
    fetchMedication();
  }, []);
  return (
    <View className="bg-background px-4 pt-4 h-full">
      <View className="flex-row items-center justify-between p-2 mb-2 w-full">
        <View className="flex-row items-center gap-4">
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
          </Pressable>
          <Text className="text-2xl text-primary">Add schedule</Text>
        </View>
      </View>
      <Text>
        {med?.medicine_name}
        {`\n`}
        {med?.count}
        {`\n`}
        {med?.whenToTake}
        {`\n`}
      </Text>
    </View>
  );
}
