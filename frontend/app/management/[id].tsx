import { Medication } from "@/components/local_db";
import { useTheme } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

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
  }

  useEffect(() => {
    console.log("Fetching medication with ID:", id);
    fetchMedication();
  }, []);
  return <View className="bg-background px-4 pt-4 h-full">
    <Text>
      {med?.medicine_name}{`\n`}
      {med?.count}{`\n`}
      {med?.whenToTake}{`\n`}</Text>
  </View>;
}
