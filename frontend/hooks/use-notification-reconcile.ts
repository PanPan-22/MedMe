import { reconcileNotifications } from "@/hooks/use-notifications";
import { useSecureStorage } from "@/hooks/use-securestore";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect } from "react";

const KEY = "last_notif_reconcile_at";
const INTERVAL_MS = 60 * 60 * 1000;

export function useNotificationReconcile() {
  const db = useSQLiteContext();
  const { getValue, save } = useSecureStorage();

  useEffect(() => {
    (async () => {
      const last = parseInt((await getValue(KEY)) ?? "0", 10) || 0;
      const now = Date.now();
      if (now - last < INTERVAL_MS) return;
      try {
        const { canceled, rescheduled } = await reconcileNotifications(db);
        console.log(`[notif reconcile] canceled=${canceled} rescheduled=${rescheduled}`);
        await save(KEY, String(now));
      } catch (e) {
        console.warn("[notif reconcile] failed", e);
      }
    })();
  }, [db]);
}
