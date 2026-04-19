import MedMeLogoBlack from "@/assets/images/black_medme.svg";
import MedMeLogoWhite from "@/assets/images/white_medme.svg";
import LanguageToggle from "@/components/language-toggle";
import { Link } from "expo-router";
import { useColorScheme } from "nativewind";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const MedMeLogo = colorScheme === "dark" ? MedMeLogoBlack : MedMeLogoWhite;

  return (
    <View className="flex-1 bg-background px-6" style={{ paddingTop: insets.top + 12 }}>
      <View className="items-end mb-4">
        <LanguageToggle />
      </View>

      <View className="flex-1 items-center justify-center gap-8">
        <View className="items-center gap-3">
          <View className="bg-primary rounded-3xl p-5 mb-2">
            <MedMeLogo width={56} height={56} />
          </View>
          <Text className="text-4xl font-bold text-primary">MedMe</Text>
          <Text className="text-primary/50 text-base text-center">{t("app_tagline")}</Text>
        </View>

        <View className="w-full gap-3">
          <Link href="/(auth)/sign-in" asChild>
            <Pressable className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full">
              <Text className="text-background text-xl font-bold">{t("sign_in")}</Text>
            </Pressable>
          </Link>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable className="active:opacity-70 items-center justify-center border-2 border-primary rounded-2xl p-4 w-full">
              <Text className="text-primary text-xl font-bold">{t("register")}</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </View>
  );
}
