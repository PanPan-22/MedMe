import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "@/context/toast-context";
import { deleteLogAndSync } from "@/db/sync-helpers";
import { useBrandColor } from "@/hooks/use-brand-color";
import { reconcileNotifications } from "@/hooks/use-notifications";
import { useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Notifications from "expo-notifications";
import { router, Stack, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
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
  const { primary } = useBrandColor();
  const db = useSQLiteContext();
  const { showToast } = useToast();
  const { user } = useUser();
  const role = (user?.unsafeMetadata as any)?.role as "patient" | "caretaker" | undefined;
  const [notifs, setNotifs] = useState<NotifInfo[]>([]);
  const [reconciling, setReconciling] = useState(false);
  const [clearLogsVisible, setClearLogsVisible] = useState(false);

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
      <View className="px-4 pt-3 pb-2 gap-2">
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => router.back()}
            className="active:opacity-70 bg-primary/10 rounded-xl p-3 items-center justify-center"
          >
            <Ionicons name="arrow-back-outline" size={22} color={primary} />
          </Pressable>
          <Pressable
            onPress={refresh}
            className="active:opacity-70 bg-primary rounded-xl p-3 items-center flex-1"
          >
            <Text className="text-background font-semibold">{t("refresh")}</Text>
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
        <Pressable
          onPress={async () => {
            if (reconciling) return;
            setReconciling(true);
            try {
              const { canceled, rescheduled } = await reconcileNotifications(db);
              showToast(`Reconciled — canceled ${canceled}, rescheduled ${rescheduled}`);
              refresh();
            } catch {
              showToast("Reconcile failed", "error");
            } finally {
              setReconciling(false);
            }
          }}
          className="active:opacity-70 flex-row items-center justify-center gap-2 bg-primary/10 border border-primary rounded-2xl p-3"
        >
          <Ionicons name="sync-outline" size={18} color={primary} />
          <Text className="text-primary font-semibold">
            {reconciling ? "Reconciling…" : "Reconcile with schedules"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setClearLogsVisible(true)}
          className="active:opacity-70 flex-row items-center justify-center gap-2 bg-red-500/10 border border-red-500 rounded-2xl p-3"
        >
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
          <Text className="text-red-500 font-semibold">{t("clear_logs")}</Text>
        </Pressable>
      </View>

      <ConfirmModal
        visible={clearLogsVisible}
        title={t("clear_logs")}
        message={t("clear_logs_confirm")}
        cancelText={t("cancel")}
        confirmText={t("delete")}
        destructive
        onCancel={() => setClearLogsVisible(false)}
        onConfirm={async () => {
          setClearLogsVisible(false);
          try {
            let synced = 0;
            if (user && role) {
              const rows = await db.getAllAsync<{ id: number }>(
                `SELECT id FROM logs WHERE sync_id IS NOT NULL`,
              );
              for (const r of rows) {
                try { await deleteLogAndSync(db, user.id, role, r.id); synced++; } catch { /* ignore */ }
              }
            }
            const result = await db.runAsync(`DELETE FROM logs`);
            showToast(`Cleared ${result.changes} log(s), synced ${synced} delete(s)`);
          } catch {
            showToast("Failed to clear logs", "error");
          }
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {notifs.length === 0 ? (
          <Text className="text-center text-primary/40 mt-10">{t("no_scheduled_notifications")}</Text>
        ) : (
          notifs.map((n) => (
            <View key={n.id} className="bg-card border border-primary/20 rounded-2xl p-4 gap-1">
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
