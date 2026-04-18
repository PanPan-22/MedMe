import Ionicons from "@expo/vector-icons/Ionicons";
import * as Notifications from "expo-notifications";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

interface NotifInfo {
  id: string;
  title: string | null | undefined;
  body: string | null | undefined;
  trigger: string;
  data: string;
}

export default function DebugNotificationsScreen() {
  const { t } = useTranslation();
  const [notifs, setNotifs] = useState<NotifInfo[]>([]);

  const refresh = useCallback(async () => {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    setNotifs(
      all.map((n) => ({
        id: n.identifier,
        title: n.content.title,
        body: n.content.body,
        trigger: JSON.stringify(n.trigger, null, 2),
        data: JSON.stringify(n.content.data, null, 2),
      }))
    );
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: `Scheduled Notifications (${notifs.length})` }} />
      <View className="px-4 pt-3 pb-2 flex-row gap-2">
        <Pressable
          onPress={() => router.back()}
          className="active:opacity-70 bg-primary/10 rounded-xl p-3 items-center justify-center"
        >
          <Ionicons name="arrow-back-outline" size={22} color="#062d13" />
        </Pressable>
        <Pressable
          onPress={refresh}
          className="active:opacity-70 bg-primary rounded-xl p-3 items-center flex-1"
        >
          <Text className="text-white font-semibold">{t("refresh")}</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await Notifications.cancelAllScheduledNotificationsAsync();
            refresh();
          }}
          className="active:opacity-70 bg-red-500 rounded-xl p-3 items-center flex-1"
        >
          <Text className="text-white font-semibold">{t("clear_all")}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {notifs.length === 0 ? (
          <Text className="text-center text-primary/40 mt-10">{t("no_scheduled_notifications")}</Text>
        ) : (
          notifs.map((n) => (
            <View key={n.id} className="bg-card border border-primary/10 rounded-2xl p-4 gap-1">
              <Text className="text-xs text-primary/40 font-mono" numberOfLines={1}>{n.id}</Text>
              <Text className="text-primary font-bold text-base">{n.title ?? t("no_title_fallback")}</Text>
              <Text className="text-primary/70 text-sm">{n.body ?? t("no_body_fallback")}</Text>
              <Text className="text-primary/40 text-xs font-mono mt-1">data: {n.data}</Text>
              <Text className="text-primary/40 text-xs font-mono">trigger: {n.trigger}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
