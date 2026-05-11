import { useToast } from "@/context/toast-context";
import { readUserProfile, watchCaretakerPatients, watchPatientLink, watchUserProfile, writeUserProfile } from "@/db/firestore-ops";
import { getLink, removeLink, upsertLink } from "@/db/sync-db";
import { backfillToCaretaker } from "@/db/sync-helpers";
import { cancelNotificationsForMed } from "@/hooks/use-notifications";
import { useUser } from "@clerk/expo";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef } from "react";

export function useSyncPresence() {
  const { user, isLoaded } = useUser();
  const db = useSQLiteContext();
  const { showToast } = useToast();
  const profileSubsRef = useRef<Map<string, () => void>>(new Map());

  const role = (user?.unsafeMetadata as any)?.role as "patient" | "caretaker" | undefined;

  useEffect(() => {
    if (!isLoaded || !user || !role) return;
    const meta = user.unsafeMetadata as { firstName?: string; lastName?: string };
    writeUserProfile({
      id: user.id,
      firstName: meta?.firstName ?? user.firstName ?? null,
      lastName: meta?.lastName ?? user.lastName ?? null,
      imageUrl: user.imageUrl,
      role,
    }).catch((e) => console.warn("writeUserProfile failed", e));
  }, [isLoaded, user, role]);

  useEffect(() => {
    if (!isLoaded || !user || role !== "patient") return;

    const backfill = async (patientClerkId: string, caretakerClerkId: string) => {
      try {
        const { schedules, logs } = await backfillToCaretaker(db, patientClerkId, caretakerClerkId);
        if (schedules || logs) {
          console.log(`[sync backfill] enqueued ${schedules} schedule(s) + ${logs} log(s) for new caretaker`);
        }
      } catch (e) {
        console.warn("[sync backfill] failed", e);
      }
    };

    // watchPatientLink delivers the current state on first snapshot, so a
    // separate one-shot readPatientLink call would race with the watcher's
    // initial fire (both writing the same row, sometimes producing a spurious
    // "caretaker has been linked" toast).
    const unsub = watchPatientLink(user.id, async (link) => {
      try {
        const existing = await getLink(db, user.id);
        if (link) {
          const linkedAt = link.linkedAt?.toDate().toISOString() ?? new Date().toISOString();
          const isNew = !existing;
          await upsertLink(db, {
            patient_clerk_id: link.patientClerkId,
            caretaker_clerk_id: link.caretakerClerkId,
            linked_at: linkedAt,
          });
          if (isNew) {
            showToast("A caretaker has been linked to your account.");
            await backfill(link.patientClerkId, link.caretakerClerkId);
          }
        } else if (existing) {
          await removeLink(db, user.id);
          showToast("Your caretaker has unlinked you.");
        }
      } catch (e) {
        console.warn("[sync presence] patient-link callback failed", e);
      }
    });

    return () => unsub();
  }, [isLoaded, user, role, db, showToast]);

  useEffect(() => {
    if (!isLoaded || !user || role !== "caretaker") return;
    const subs = profileSubsRef.current;

    const unsub = watchCaretakerPatients(user.id, async (links) => {
     try {
      const remoteIds = new Set(links.map((l) => l.patientClerkId));
      const localPatients = await db.getAllAsync<{ id: number; clerk_user_id: string | null; name: string }>(
        `SELECT id, clerk_user_id, name FROM patients WHERE clerk_user_id IS NOT NULL`,
      );
      const localIds = new Set(localPatients.map((p) => p.clerk_user_id));

      // Remove patients no longer in remote
      for (const p of localPatients) {
        if (p.clerk_user_id && !remoteIds.has(p.clerk_user_id)) {
          const notifs = await db.getAllAsync<{ notification_id: string | null }>(
            `SELECT notification_id FROM schedules WHERE patient_id = ?`, [p.id],
          );
          for (const n of notifs) {
            if (n.notification_id) {
              try { await cancelNotificationsForMed(n.notification_id); } catch { /* ignore */ }
            }
          }
          await db.runAsync(`DELETE FROM schedules WHERE patient_id = ?`, [p.id]);
          await db.runAsync(`DELETE FROM logs WHERE patient_id = ?`, [p.id]);
          await db.runAsync(`DELETE FROM patients WHERE id = ?`, [p.id]);
          showToast(`${p.name} has unlinked.`);

          const sub = subs.get(p.clerk_user_id);
          if (sub) { sub(); subs.delete(p.clerk_user_id); }
        }
      }

      // Add new patients that appeared remotely
      for (const link of links) {
        if (!localIds.has(link.patientClerkId)) {
          try {
            const profile = await readUserProfile(link.patientClerkId);
            if (profile) {
              const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Patient";
              await db.runAsync(
                `INSERT OR IGNORE INTO patients (name, image_uri, clerk_user_id, updated_at) VALUES (?, ?, ?, ?)`,
                [fullName, profile.imageUrl ?? null, profile.clerkId, new Date().toISOString()],
              );
            }
          } catch (e) { console.warn("auto-add patient failed", e); }
        }
      }

      // Subscribe to profile updates for each linked patient
      const currentRemoteIds = Array.from(remoteIds);
      for (const patientClerkId of currentRemoteIds) {
        if (subs.has(patientClerkId)) continue;
        const unsubProfile = watchUserProfile(patientClerkId, async (profile) => {
          try {
            if (!profile) return;
            const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
            await db.runAsync(
              `UPDATE patients SET name = COALESCE(NULLIF(?, ''), name), image_uri = ?, updated_at = ? WHERE clerk_user_id = ?`,
              [fullName, profile.imageUrl ?? null, new Date().toISOString(), patientClerkId],
            );
          } catch (e) {
            console.warn("[sync presence] profile-watch callback failed", e);
          }
        });
        subs.set(patientClerkId, unsubProfile);
      }
     } catch (e) {
       console.warn("[sync presence] caretaker-patients callback failed", e);
     }
    });

    return () => {
      unsub();
      for (const sub of subs.values()) sub();
      subs.clear();
    };
  }, [isLoaded, user, role, db, showToast]);
}
