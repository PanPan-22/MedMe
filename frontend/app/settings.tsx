import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

export default function SettingsScreen() {
  const { colors } = useTheme();
  return (
    <ScrollView className="bg-background px-4 pt-4 h-full">
      <Stack.Screen options={{ headerShown: true, title: "Settings" }} />

      <View className="flex-row items-center gap-4">
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
        </Pressable>
        <Text className="text-2xl text-primary">Settings</Text>
      </View>
    </ScrollView>
  );
}
