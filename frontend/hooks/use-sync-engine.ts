import { applyEvent } from "@/db/apply-event";
import {
  deleteSyncEvent,
  pushSyncEvent,
  watchIncomingEvents,
} from "@/db/firestore-ops";
import { writeSnapshot } from "@/db/snapshot";
import {
  hasProcessed,
  markOutboxFailure,
  markProcessed,
  pendingOutbox,
  removeFromOutbox,
  rowToSyncEvent,
} from "@/db/sync-db";
import { SyncEvent } from "@/db/sync-types";
import { waitForBoundary } from "@/hooks/use-user-boundary";
import { useUser } from "@clerk/expo";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef } from "react";

const FLUSH_INTERVAL_MS = 3_000;
const SNAPSHOT_INTERVAL_MS = 5 * 60_000;
// Cap retries for events that can't yet be applied (e.g. log arrived before
// its schedule). After this many attempts we give up and mark processed so
// we don't loop forever if the dependency genuinely never arrives.
const MAX_APPLY_RETRIES = 10;

// Push every pending outbox event to Firestore. Returns the number flushed.
// Safe to call from anywhere (e.g. pre-signout); not gated on a React effect.
export async function flushOutboxOnce(
  db: import("expo-sqlite").SQLiteDatabase,
  userId: string,
): Promise<number> {
  const rows = await pendingOutbox(db, 100);
  let flushed = 0;
  for (const row of rows) {
    const event = rowToSyncEvent(row, userId);
    try {
      await pushSyncEvent(event);
      await removeFromOutbox(db, row.event_id);
      flushed++;
    } catch (e: any) {
      console.warn("[flushOutboxOnce] push failed:", e?.message ?? e);
      await markOutboxFailure(db, row.event_id, e?.message ?? String(e));
      break;
    }
  }
  if (flushed > 0) console.log(`[flushOutboxOnce] flushed ${flushed}/${rows.length} events`);
  return flushed;
}

export function useSyncEngine() {
  const { user, isLoaded } = useUser();
  const db = useSQLiteContext();
  const flushing = useRef(false);
  // Tracks per-event retry counts for events that returned skip/retry from applyEvent.
  // Lives in memory only — resets on app reload, which is fine.
  const applyRetries = useRef(new Map<string, number>());

  const role = (user?.unsafeMetadata as any)?.role as "patient" | "caretaker" | undefined;

  useEffect(() => {
    if (!isLoaded || !user || !role) return;
    let cancelled = false;
    const write = async () => {
      // Wait until useUserBoundary has finished its wipe + restore so we
      // never blow away a good Firestore snapshot with stale/empty local state.
      await waitForBoundary();
      if (cancelled) return;
      writeSnapshot(user.id, db).catch((e) => console.warn("writeSnapshot failed", e));
    };
    write().catch((e) => console.warn("[sync] snapshot write failed", e));
    const id = setInterval(
      () => write().catch((e) => console.warn("[sync] snapshot write failed", e)),
      SNAPSHOT_INTERVAL_MS,
    );
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isLoaded, user, role, db]);

  useEffect(() => {
    if (!isLoaded || !user || !role) return;

    const flush = async () => {
      if (flushing.current) return;
      flushing.current = true;
      try {
        await waitForBoundary();
        const rows = await pendingOutbox(db, 50);
        if (rows.length > 0) console.log(`[sync] flushing ${rows.length} outbox events`);
        for (const row of rows) {
          const event = rowToSyncEvent(row, user.id);
          try {
            await pushSyncEvent(event);
            await removeFromOutbox(db, row.event_id);
            console.log(`[sync] pushed ${event.type} -> ${event.targetClerkId.slice(0, 8)}`);
          } catch (e: any) {
            console.warn(`[sync] push failed:`, e?.message ?? e);
            await markOutboxFailure(db, row.event_id, e?.message ?? String(e));
            break;
          }
        }
      } catch (e) {
        console.warn("[sync] flush failed", e);
      } finally {
        flushing.current = false;
      }
    };

    flush();
    const id = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isLoaded, user, role, db]);

  useEffect(() => {
    if (!isLoaded || !user || !role) return;

    const unsub = watchIncomingEvents(user.id, async (events: SyncEvent[]) => {
     try {
      await waitForBoundary();
      if (events.length > 0) console.log(`[sync] received ${events.length} incoming events`);
      // Process schedule events before log events so a log can find its parent
      // schedule already applied locally, instead of being skipped + retried.
      const eventPriority = (e: SyncEvent): number => {
        switch (e.type) {
          case "schedule.upsert": return 0;
          case "schedule.delete": return 1;
          case "log.upsert":      return 2;
          case "log.delete":      return 3;
          default:                return 4;
        }
      };
      const sorted = [...events].sort((a, b) => eventPriority(a) - eventPriority(b));
      for (const event of sorted) {
        if (event.sourceClerkId === user.id) {
          try { await deleteSyncEvent(user.id, event.eventId); } catch { /* ignore */ }
          continue;
        }
        if (await hasProcessed(db, event.eventId)) {
          try { await deleteSyncEvent(user.id, event.eventId); } catch { /* ignore */ }
          continue;
        }
        try {
          console.log(`[sync] applying ${event.type} from ${event.sourceClerkId.slice(0, 8)}`);
          const ok = await applyEvent({ db, selfClerkId: user.id, selfRole: role }, event);
          if (!ok) {
            // Dependency missing (e.g. log before its schedule). Leave the event
            // in Firestore so the next listener tick retries — but cap retries.
            const attempts = (applyRetries.current.get(event.eventId) ?? 0) + 1;
            applyRetries.current.set(event.eventId, attempts);
            if (attempts >= MAX_APPLY_RETRIES) {
              console.warn(`[sync] giving up on ${event.type} ${event.eventId.slice(0, 8)} after ${attempts} retries`);
              await markProcessed(db, event.eventId);
              await deleteSyncEvent(user.id, event.eventId);
              applyRetries.current.delete(event.eventId);
            }
            continue;
          }
          applyRetries.current.delete(event.eventId);
          await markProcessed(db, event.eventId);
          await deleteSyncEvent(user.id, event.eventId);
        } catch (e) {
          console.warn("[sync] applyEvent failed", event.type, e);
        }
      }
     } catch (e) {
       console.warn("[sync] inbox callback failed", e);
     }
    });

    return () => unsub();
  }, [isLoaded, user, role, db]);

}
