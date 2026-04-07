import { useTheme } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { View } from "react-native";

export default function individualMedicationScreen() {
  const { colors } = useTheme();
  const db = useSQLiteContext();
  const id = useLocalSearchParams().id;

  return <View className="bg-background px-4 pt-4 h-full">Hello {id}</View>;
}
