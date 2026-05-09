import { BackHeader } from "@/components/back-header";
import { useBrandColor } from "@/hooks/use-brand-color";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import NetInfo from "@react-native-community/netinfo";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

export default function AddMedicineScreen() {
  const { t } = useTranslation();
  const { primary: brandColor, background } = useBrandColor();
  const { patientId, patientName } = useLocalSearchParams<{ patientId?: string; patientName?: string }>();
  const [isConnected, setIsConnected] = useState<boolean | null>(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isConnected = on a network; isInternetReachable = that network has internet.
      // Pillbox AP returns isConnected=true but isInternetReachable=false.
      const reachable = state.isInternetReachable ?? state.isConnected;
      setIsConnected(state.isConnected === true && reachable !== false);
    });
    return () => unsubscribe();
  }, []);

  const extraParams = patientId ? { patientId, patientName: patientName ?? "" } : {};

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: t("add_schedule") }} />
      <BackHeader title={t("add_schedule")} />
      <ScrollView className="px-4">
      <View className="flex-column items-center justify-around gap-4 p-2 mb-4 w-full">
        <Pressable
          disabled={!isConnected}
          onPress={() => router.push({ pathname: "/read-label", params: extraParams })}
          className={`active:opacity-70 flex-column items-center justify-center w-full rounded-3xl py-10 gap-3 ${
            isConnected ? "bg-primary" : "bg-gray-400"
          }`}
        >
          <Feather name="camera" size={64} color={background} />
          <View className="items-center gap-1">
            <Text className="text-background text-3xl font-semibold" maxFontSizeMultiplier={1.2}>
              {t("read_label")}
            </Text>
            {!isConnected && (
              <Text className="text-background text-sm opacity-80" maxFontSizeMultiplier={1.2}>
                {t("no_internet_connection")}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: "/manual-add", params: extraParams })}
          className="active:opacity-70 flex-column items-center justify-center bg-primary w-full rounded-3xl py-10 gap-3"
        >
          <FontAwesome name="calendar" size={64} color={background} />
          <Text className="text-background text-3xl font-semibold" maxFontSizeMultiplier={1.2}>
            {t("fill_field")}
          </Text>
        </Pressable>
      </View>
      </ScrollView>
    </View>
  );
}
