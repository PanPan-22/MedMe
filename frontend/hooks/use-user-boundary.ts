import { isLocalDbEmpty, readSnapshot, restoreSnapshot } from "@/db/snapshot";
import { reconcileNotifications } from "@/hooks/use-notifications";
import { useSecureStorage } from "@/hooks/use-securestore";
import { useUser } from "@clerk/expo";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef } from "react";

const LAST_USER_KEY = "last_signed_in_user_id";

// Module-level flag the sync engine waits on before its first snapshot write,
// so we never overwrite a good Firestore snapshot with an empty local DB before
// the boundary's wipe + restore have completed.
let _boundaryComplete = false;
const _waiters: Array<() => void> = [];
export function waitForBoundary(): Promise<void> {
  if (_boundaryComplete) return Promise.resolve();
  return new Promise((resolve) => _waiters.push(resolve));
}
function markBoundaryComplete() {
  _boundaryComplete = true;
  while (_waiters.length) _waiters.shift()!();
}

/**
 * On first mount per session, this hook does the boot sequence in order:
 *   1. If the signed-in user changed since last session, wipe local tables.
 *   2. If the local DB is now empty, restore from this user's Firestore snapshot.
 *   3. Save current user.id to SecureStore for the next session's check.
 *
 * Folding restore into this hook (instead of useSyncEngine) avoids a race where
 * the sync engine could observe stale local-DB state.
 */
export function useUserBoundary() {
  const { user, isLoaded } = useUser();
  const db = useSQLiteContext();
  const { getValue, save } = useSecureStorage();
  const ran = useRef(false);

  useEffect(() => {
    if (!isLoaded || !user || ran.current) return;
    ran.current = true;
    // Reset for this cycle BEFORE async work begins. Otherwise sync engine
    // calls to waitForBoundary() see a stale `true` from a previous session
    // (this AppLayout instance's predecessor) and start applying inbox events
    // while the new wipe + restore are still mid-flight.
    _boundaryComplete = false;
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

        // Restore from snapshot if local DB is now empty.
        try {
          if (await isLocalDbEmpty(db)) {
            const snap = await readSnapshot(user.id);
            if (snap && (snap.schedules.length || snap.logs.length || snap.patients.length)) {
              await restoreSnapshot(db, snap);
              console.log(`[boundary] restored: ${snap.schedules.length} schedules, ${snap.patients.length} patients, ${snap.logs.length} logs`);
            } else {
              console.log("[boundary] no snapshot to restore");
            }
          }
        } catch (e) {
          console.warn("[boundary] snapshot restore failed", e);
        }

        // Reconcile OS notifications against the just-restored DB BEFORE the
        // sync engine unblocks. Done here (instead of as a separate effect) so
        // reconcile and inbox-apply can't interleave and orphan notifications
        // for a soon-to-be-deleted schedule.
        try {
          const { canceled, rescheduled } = await reconcileNotifications(db);
          console.log(`[boundary] reconciled notifs: canceled=${canceled} rescheduled=${rescheduled}`);
        } catch (e) {
          console.warn("[boundary] reconcile failed", e);
        }
      } catch (e) {
        console.warn("[boundary] boot sequence failed", e);
      } finally {
        markBoundaryComplete();
      }
    })();
  }, [isLoaded, user, db, getValue, save]);
}
