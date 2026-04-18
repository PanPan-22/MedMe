import { applyEvent } from "@/db/apply-event";
import {
  deleteSyncEvent,
  pushSyncEvent,
  readCaretakerPatients,
  watchIncomingEvents,
} from "@/db/firestore-ops";
import { isLocalDbEmpty, readSnapshot, restoreSnapshot, writeSnapshot } from "@/db/snapshot";
import {
  hasProcessed,
  markOutboxFailure,
  markProcessed,
  pendingOutbox,
  removeFromOutbox,
  rowToSyncEvent,
} from "@/db/sync-db";
import { SyncEvent } from "@/db/sync-types";
import { useUser } from "@clerk/expo";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef } from "react";

const FLUSH_INTERVAL_MS = 10_000;
const SNAPSHOT_INTERVAL_MS = 5 * 60_000;

export function useSyncEngine() {
  const { user, isLoaded } = useUser();
  const db = useSQLiteContext();
  const flushing = useRef(false);
  const restored = useRef(false);

  const role = (user?.unsafeMetadata as any)?.role as "patient" | "caretaker" | undefined;

  useEffect(() => {
    if (!isLoaded || !user || !role || restored.current) return;
    restored.current = true;
    (async () => {
      try {
        if (!(await isLocalDbEmpty(db))) return;
        const snap = await readSnapshot(user.id);
        if (!snap) return;
        await restoreSnapshot(db, snap);
        console.log("[sync] restored snapshot");
      } catch (e) {
        console.warn("[sync] snapshot restore failed", e);
      }
    })();
  }, [isLoaded, user, role, db]);

  useEffect(() => {
    if (!isLoaded || !user || !role) return;
    const write = () => writeSnapshot(user.id, db).catch((e) => console.warn("writeSnapshot failed", e));
    write();
    const id = setInterval(write, SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isLoaded, user, role, db]);

  useEffect(() => {
    if (!isLoaded || !user || !role) return;

    const flush = async () => {
      if (flushing.current) return;
      flushing.current = true;
      try {
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
      if (events.length > 0) console.log(`[sync] received ${events.length} incoming events`);
      for (const event of events) {
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
          await applyEvent({ db, selfClerkId: user.id, selfRole: role }, event);
          await markProcessed(db, event.eventId);
          await deleteSyncEvent(user.id, event.eventId);
        } catch (e) {
          console.warn("[sync] applyEvent failed", event.type, e);
        }
      }
    });

    return () => unsub();
  }, [isLoaded, user, role, db]);

  useEffect(() => {
    if (!isLoaded || !user || role !== "caretaker") return;
    readCaretakerPatients(user.id).then((links) => {
      console.log(`[sync] caretaker has ${links.length} linked patients`);
    }).catch(() => {});
  }, [isLoaded, user, role]);
}
