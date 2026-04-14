import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { Link, router, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

export default function AddMedicineScreen() {
  const { colors } = useTheme();
  return (
    <ScrollView className="bg-background p-2">
      <Stack.Screen options={{ headerShown: true, title: "Add Schedule" }} />
      <View className="flex-row items-center justify-between p-2 mb-2 w-full">
        <View className="flex-row items-center gap-4">
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
          </Pressable>
          <Text className="text-2xl text-primary">Add schedule</Text>
        </View>
      </View>
      <View className="flex-column items-center justify-around gap-4 p-2 mb-4 w-full">
        <Link href="/read-label" push asChild>
          <Pressable className="flex-column gap-8 items-center justify-center bg-primary w-full h-[20rem] rounded-3xl">
            <Feather name="camera" size={120} color="white" />
            <Text className="text-white text-6xl">Read Label</Text>
          </Pressable>
        </Link>
        <Link href="/manual-add" push asChild>
          <Pressable className="flex-column gap-8 items-center justify-center bg-primary w-full h-[20rem] rounded-3xl">
            <FontAwesome name="calendar" size={120} color="white" />
            <Text className="text-white text-6xl">Fill Field</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}
