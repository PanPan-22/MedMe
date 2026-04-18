import { useToast } from "@/context/toast-context";
import { readPatientLink, watchCaretakerPatients, watchPatientLink, writeUserProfile } from "@/db/firestore-ops";
import { getLink, removeLink, upsertLink } from "@/db/sync-db";
import { cancelNotificationsForMed } from "@/hooks/use-notifications";
import { useUser } from "@clerk/expo";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect } from "react";

export function useSyncPresence() {
  const { user, isLoaded } = useUser();
  const db = useSQLiteContext();
  const { showToast } = useToast();

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

    readPatientLink(user.id)
      .then(async (link) => {
        const existing = await getLink(db, user.id);
        if (link && !existing) {
          await upsertLink(db, {
            patient_clerk_id: link.patientClerkId,
            caretaker_clerk_id: link.caretakerClerkId,
            linked_at: link.linkedAt?.toDate().toISOString() ?? new Date().toISOString(),
          });
        } else if (!link && existing) {
          await removeLink(db, user.id);
        }
      })
      .catch((e) => console.warn("readPatientLink failed", e));

    const unsub = watchPatientLink(user.id, async (link) => {
      const existing = await getLink(db, user.id);
      if (link) {
        const linkedAt = link.linkedAt?.toDate().toISOString() ?? new Date().toISOString();
        const isNew = !existing;
        await upsertLink(db, {
          patient_clerk_id: link.patientClerkId,
          caretaker_clerk_id: link.caretakerClerkId,
          linked_at: linkedAt,
        });
        if (isNew) showToast("A caretaker has been linked to your account.");
      } else if (existing) {
        await removeLink(db, user.id);
        showToast("Your caretaker has unlinked you.");
      }
    });

    return () => unsub();
  }, [isLoaded, user, role, db, showToast]);

  useEffect(() => {
    if (!isLoaded || !user || role !== "caretaker") return;
    const unsub = watchCaretakerPatients(user.id, async (links) => {
      const remoteIds = new Set(links.map((l) => l.patientClerkId));
      const localPatients = await db.getAllAsync<{ id: number; clerk_user_id: string | null; name: string }>(
        `SELECT id, clerk_user_id, name FROM patients WHERE clerk_user_id IS NOT NULL`,
      );
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
          await db.runAsync(`DELETE FROM medication_logs WHERE patient_id = ?`, [p.id]);
          await db.runAsync(`DELETE FROM patients WHERE id = ?`, [p.id]);
          showToast(`${p.name} has unlinked.`);
        }
      }
    });
    return () => unsub();
  }, [isLoaded, user, role, db, showToast]);
}
