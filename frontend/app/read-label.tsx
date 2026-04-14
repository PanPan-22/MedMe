import ImageInput from "@/components/image-input";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

export default function MedicineScreen() {
  const { colors } = useTheme();
  return (
    <ScrollView className="bg-background px-4 pt-4 h-full">
      <Stack.Screen options={{ headerShown: true, title: "Read Label" }} />
      <View className="flex-row items-center justify-between p-2 mb-2 w-full">
        <View className="flex-row items-center gap-4">
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
          </Pressable>
          <Text className="text-2xl text-primary">Read label</Text>
        </View>
      </View>
      <ImageInput />
    </ScrollView>
  );
}
