import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { Link, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

export default function ManagementScreen() {
  const { colors } = useTheme();

  return (
    <ScrollView className="bg-background p-2">
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
    </ScrollView>
  );
}
