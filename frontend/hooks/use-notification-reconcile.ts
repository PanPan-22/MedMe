import { reconcileNotifications } from "@/hooks/use-notifications";
import { useSecureStorage } from "@/hooks/use-securestore";
import { waitForBoundary } from "@/hooks/use-user-boundary";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect } from "react";

const KEY = "last_notif_reconcile_at";

export function useNotificationReconcile() {
  const db = useSQLiteContext();
  const { save } = useSecureStorage();

  useEffect(() => {
    (async () => {
      // Always run once per app launch, after boundary's wipe + restore + dedup.
      // This catches orphan OS notifications left behind when conflict-dedup or
      // sync-driven row deletes happen without cancelling their notifications.
      await waitForBoundary();
      try {
        const { canceled, rescheduled } = await reconcileNotifications(db);
        console.log(`[notif reconcile] canceled=${canceled} rescheduled=${rescheduled}`);
        await save(KEY, String(Date.now()));
      } catch (e) {
        console.warn("[notif reconcile] failed", e);
      }
    })();
  }, [db]);
}
