import Feather from "@expo/vector-icons/Feather";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Link, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <ScrollView className="bg-background p-2">
      <Stack.Screen options={{ headerShown: true, title: "Home" }} />
      <View className="items-center">
        <View className="flex-row items-center justify-center border border-primary gap-4 p-2 mb-4">
          <Text className="text-3xl text-primary">Next Medication</Text>
          <View className="flex-row border-2 border-[#FFB916] bg-amber-50 rounded-full items-center justify-center gap-2 px-3 py-1">
            <Feather name="moon" size={32} color="#FFB916" />
            <Text className="text-[#FFB916] text-center text-3xl">8:00</Text>
          </View>
        </View>
        <Link href="/management" push asChild>
          <Pressable className="flex-row items-center justify-center gap-4 bg-primary rounded-xl p-4">
            <FontAwesome6 name="pills" size={32} color="white" />
            <Text className="text-2xl text-white">Medicine Management</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}
