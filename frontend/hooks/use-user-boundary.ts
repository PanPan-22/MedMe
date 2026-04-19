import { useSecureStorage } from "@/hooks/use-securestore";
import { useUser } from "@clerk/expo";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef } from "react";

const LAST_USER_KEY = "last_signed_in_user_id";

/**
 * When the signed-in Clerk user changes on this device, wipe all local tables
 * so the previous user's data doesn't leak into the new user's session.
 * The sync engine's snapshot-restore step will refill from Firestore if a
 * snapshot exists for the new user.
 */
export function useUserBoundary() {
  const { user, isLoaded } = useUser();
  const db = useSQLiteContext();
  const { getValue, save } = useSecureStorage();
  const ran = useRef(false);

  useEffect(() => {
    if (!isLoaded || !user || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const lastUserId = await getValue(LAST_USER_KEY);
        if (lastUserId && lastUserId !== user.id) {
          console.log(`[boundary] user changed ${lastUserId.slice(0, 8)} -> ${user.id.slice(0, 8)}, wiping local DB`);
          await db.execAsync(`
            DELETE FROM schedules;
            DELETE FROM logs;
            DELETE FROM patients;
            DELETE FROM patient_links;
            DELETE FROM outbox;
            DELETE FROM inbox_processed;
          `);
        }
        await save(LAST_USER_KEY, user.id);
      } catch (e) {
        console.warn("[boundary] user-change wipe failed", e);
      }
    })();
  }, [isLoaded, user, db, getValue, save]);
}
