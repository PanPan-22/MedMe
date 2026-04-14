import { useSecureStorage } from "@/hooks/use-securestore";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack } from "expo-router";
import { useColorScheme } from "nativewind"; // 1. Import useColorScheme
import { Pressable, ScrollView, Text, View } from "react-native";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { save } = useSecureStorage(); // 2. Pull save from your hook
  const { colorScheme, setColorScheme } = useColorScheme();

  // 3. Create a handler to update both UI and Storage
  const toggleTheme = async (theme: "light" | "dark") => {
    setColorScheme(theme);
    await save("colorScheme", theme);
  };

  return (
    <ScrollView className="bg-background px-4 pt-4 h-full">
      <Stack.Screen options={{ headerShown: true, title: "Settings" }} />
      <View className="flex-row items-center justify-between p-2 mb-2 w-full">
        <View className="flex-row items-center gap-4">
          <Pressable onPress={() => router.back()}>
            <Ionicons
              name="arrow-back-outline"
              size={24}
              color={colorScheme === "light" ? "#062d13" : "white"}
            />
          </Pressable>
          <Text className="text-2xl text-primary">Settings</Text>
        </View>
      </View>

      {/* Theme Selector Section */}
      <View className="border-primary border-y px-2 py-4">
        <Text className="text-primary font-semibold mb-4 text-xl">
          Appearance
        </Text>

        <View className="flex-row gap-4">
          {/* Light Mode Button */}
          <Pressable
            onPress={() => toggleTheme("light")}
            className={`flex-1 flex-row items-center justify-center gap-2 p-4 rounded-xl border ${
              colorScheme === "light"
                ? "bg-primary border-primary"
                : "bg-[#2E2E2E] border-border"
            }`}
          >
            <Ionicons name="sunny-outline" size={20} color={"white"} />
            <Text
              className={
                colorScheme === "light"
                  ? "text-white font-bold"
                  : "text-white text-foreground"
              }
            >
              Light
            </Text>
          </Pressable>

          {/* Dark Mode Button */}
          <Pressable
            onPress={() => toggleTheme("dark")}
            className={`flex-1 flex-row items-center justify-center gap-2 p-4 rounded-xl border ${
              colorScheme === "dark"
                ? "bg-primary border-primary"
                : "bg-transparent border-primary"
            }`}
          >
            <Ionicons
              name="moon-outline"
              size={20}
              color={colorScheme === "dark" ? "black" : "#062d13"}
            />
            <Text
              className={
                colorScheme === "dark"
                  ? "text-black font-bold"
                  : "text-foreground"
              }
            >
              Dark
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
