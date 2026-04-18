import { useSecureStorage } from "@/hooks/use-securestore";
import { useClerk } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack } from "expo-router";
import { useColorScheme } from "nativewind";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

// Mirror values from global.css so Ionicons (which can't use NativeWind classes) get the right color.
const THEME_COLORS = {
  light: { primary: "#062d13", background: "#f2fbf5" },
  dark:  { primary: "#ffffff", background: "#000000" },
};

export default function SettingsScreen() {
  const { save } = useSecureStorage();
  const { signOut } = useClerk();
  const { colorScheme, setColorScheme } = useColorScheme();
  const { t, i18n } = useTranslation();

  const currentLanguage = i18n.resolvedLanguage;
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const primaryColor = THEME_COLORS[scheme].primary;
  const bgColor = THEME_COLORS[scheme].background;

  const toggleTheme = async (theme: "light" | "dark") => {
    setColorScheme(theme);
    await save("colorScheme", theme);
  };

  const selectedCls = "bg-primary border-primary";
  const unselectedCls = "bg-transparent border-primary/30";

  return (
    <ScrollView className="bg-background px-4 pt-4 h-full">
      <Stack.Screen options={{ headerShown: true, title: "Settings" }} />

      <View className="flex-row items-center gap-4 p-2 mb-4">
        <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
          <Ionicons name="arrow-back-outline" size={24} color={primaryColor} />
        </Pressable>
        <Text className="text-2xl font-bold text-primary">{t("settings")}</Text>
      </View>

      {/* Appearance */}
      <View className="px-2 py-4">
        <Text className="text-primary font-semibold mb-4 text-xl">{t("appearance_heading")}</Text>
        <View className="flex-row gap-4">
          <Pressable
            onPress={() => toggleTheme("light")}
            className={`flex-1 flex-row items-center justify-center gap-2 p-4 rounded-xl border ${
              colorScheme === "light" ? selectedCls : unselectedCls
            }`}
          >
            <Ionicons
              name="sunny-outline"
              size={20}
              color={colorScheme === "light" ? bgColor : primaryColor}
            />
            <Text className={colorScheme === "light" ? "text-background font-bold" : "text-primary"}>
              {t("light_mode")}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => toggleTheme("dark")}
            className={`flex-1 flex-row items-center justify-center gap-2 p-4 rounded-xl border ${
              colorScheme === "dark" ? selectedCls : unselectedCls
            }`}
          >
            <Ionicons
              name="moon-outline"
              size={20}
              color={colorScheme === "dark" ? bgColor : primaryColor}
            />
            <Text className={colorScheme === "dark" ? "text-background font-bold" : "text-primary"}>
              {t("dark_mode")}
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="border-b border-gray-200" />

      {/* Language */}
      <View className="px-2 py-4">
        <Text className="text-primary font-semibold mb-4 text-xl">{t("language_heading")}</Text>
        <View className="flex-row gap-4">
          <Pressable
            onPress={() => i18n.changeLanguage("en")}
            className={`flex-1 flex-row items-center justify-center gap-2 p-4 rounded-xl border ${
              currentLanguage === "en" ? selectedCls : unselectedCls
            }`}
          >
            <Text className={currentLanguage === "en" ? "text-background font-bold" : "text-primary"}>
              🇬🇧 English
            </Text>
          </Pressable>

          <Pressable
            onPress={() => i18n.changeLanguage("th")}
            className={`flex-1 flex-row items-center justify-center gap-2 p-4 rounded-xl border ${
              currentLanguage === "th" ? selectedCls : unselectedCls
            }`}
          >
            <Text className={currentLanguage === "th" ? "text-background font-bold" : "text-primary"}>
              🇹🇭 ไทย
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="border-b border-gray-200" />

      {/* Sign Out */}
      <Pressable
        className="active:opacity-70 flex-row items-center justify-center gap-2 bg-red-500 rounded-2xl p-4 mt-6 mb-10"
        onPress={() => signOut({ redirectUrl: "/(auth)" })}
      >
        <Ionicons name="log-out-outline" size={20} color="white" />
        <Text className="text-white font-bold text-base">Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}
