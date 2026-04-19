import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { firestore } from "../firebaseConfig";
import {
  PAIRING_CODES_COLLECTION,
  PATIENT_LINKS_COLLECTION,
  SNAPSHOTS_COLLECTION,
  SYNC_EVENTS_COLLECTION,
  SyncEvent,
  USERS_COLLECTION,
} from "./sync-types";

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;

export interface FirestoreUser {
  clerkId: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  role: "patient" | "caretaker";
  updatedAt: Timestamp | null;
}

export interface FirestorePatientLink {
  patientClerkId: string;
  caretakerClerkId: string;
  linkedAt: Timestamp | null;
}

export interface FirestorePairingCode {
  code: string;
  patientClerkId: string;
  expiresAt: Timestamp;
  used: boolean;
}

export async function writeUserProfile(user: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  role: "patient" | "caretaker";
}) {
  await setDoc(
    doc(firestore, USERS_COLLECTION, user.id),
    {
      clerkId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      role: user.role,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function readUserProfile(clerkId: string): Promise<FirestoreUser | null> {
  const snap = await getDoc(doc(firestore, USERS_COLLECTION, clerkId));
  return snap.exists() ? (snap.data() as FirestoreUser) : null;
}

export function watchUserProfile(clerkId: string, cb: (profile: FirestoreUser | null) => void) {
  return onSnapshot(doc(firestore, USERS_COLLECTION, clerkId), (snap) => {
    cb(snap.exists() ? (snap.data() as FirestoreUser) : null);
  });
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createPairingCode(patientClerkId: string): Promise<{ code: string; expiresAt: Date }> {
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const ref = doc(firestore, PAIRING_CODES_COLLECTION, code);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const data = existing.data() as FirestorePairingCode;
      if (!data.used && data.expiresAt.toMillis() > Date.now()) continue;
    }
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
    await setDoc(ref, {
      code,
      patientClerkId,
      expiresAt: Timestamp.fromDate(expiresAt),
      used: false,
    });
    return { code, expiresAt };
  }
  throw new Error("Could not allocate a pairing code");
}

export async function redeemPairingCode(params: {
  code: string;
  caretakerClerkId: string;
}): Promise<{ patientClerkId: string }> {
  const ref = doc(firestore, PAIRING_CODES_COLLECTION, params.code);
  return runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Invalid code");
    const data = snap.data() as FirestorePairingCode;
    if (data.used) throw new Error("Code already used");
    if (data.expiresAt.toMillis() < Date.now()) throw new Error("Code expired");

    const linkRef = doc(firestore, PATIENT_LINKS_COLLECTION, data.patientClerkId);
    const linkSnap = await tx.get(linkRef);
    if (linkSnap.exists()) throw new Error("Patient already has a caretaker");

    tx.update(ref, { used: true });
    tx.set(linkRef, {
      patientClerkId: data.patientClerkId,
      caretakerClerkId: params.caretakerClerkId,
      linkedAt: serverTimestamp(),
    });
    return { patientClerkId: data.patientClerkId };
  });
}

export async function deletePairingCode(code: string) {
  await deleteDoc(doc(firestore, PAIRING_CODES_COLLECTION, code));
}

export function watchPatientLink(
  patientClerkId: string,
  cb: (link: FirestorePatientLink | null) => void,
) {
  return onSnapshot(doc(firestore, PATIENT_LINKS_COLLECTION, patientClerkId), (snap) => {
    cb(snap.exists() ? (snap.data() as FirestorePatientLink) : null);
  });
}

export async function readPatientLink(patientClerkId: string): Promise<FirestorePatientLink | null> {
  const snap = await getDoc(doc(firestore, PATIENT_LINKS_COLLECTION, patientClerkId));
  return snap.exists() ? (snap.data() as FirestorePatientLink) : null;
}

export async function readCaretakerPatients(caretakerClerkId: string): Promise<FirestorePatientLink[]> {
  const q = query(
    collection(firestore, PATIENT_LINKS_COLLECTION),
    where("caretakerClerkId", "==", caretakerClerkId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as FirestorePatientLink);
}

export function watchCaretakerPatients(
  caretakerClerkId: string,
  cb: (links: FirestorePatientLink[]) => void,
) {
  const q = query(
    collection(firestore, PATIENT_LINKS_COLLECTION),
    where("caretakerClerkId", "==", caretakerClerkId),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.data() as FirestorePatientLink));
  });
}

export async function removePatientLink(patientClerkId: string) {
  await deleteDoc(doc(firestore, PATIENT_LINKS_COLLECTION, patientClerkId));
}

export async function pushSyncEvent(event: SyncEvent) {
  await setDoc(
    doc(firestore, SYNC_EVENTS_COLLECTION, event.targetClerkId, "items", event.eventId),
    {
      eventId: event.eventId,
      sourceClerkId: event.sourceClerkId,
      type: event.type,
      payload: event.payload,
      sourceUpdatedAt: event.sourceUpdatedAt,
      createdAt: event.createdAt,
    },
  );
}

export async function deleteSyncEvent(targetClerkId: string, eventId: string) {
  await deleteDoc(doc(firestore, SYNC_EVENTS_COLLECTION, targetClerkId, "items", eventId));
}

export async function deleteAccountFirestore(clerkId: string, role: "patient" | "caretaker") {
  if (role === "patient") {
    try { await deleteDoc(doc(firestore, PATIENT_LINKS_COLLECTION, clerkId)); } catch { /* no link */ }
  } else {
    const patients = await readCaretakerPatients(clerkId);
    for (const p of patients) {
      try { await deleteDoc(doc(firestore, PATIENT_LINKS_COLLECTION, p.patientClerkId)); } catch { /* ignore */ }
    }
  }
  try { await deleteDoc(doc(firestore, USERS_COLLECTION, clerkId)); } catch { /* ignore */ }
  try { await deleteDoc(doc(firestore, SNAPSHOTS_COLLECTION, clerkId)); } catch { /* ignore */ }

  const eventsSnap = await getDocs(collection(firestore, SYNC_EVENTS_COLLECTION, clerkId, "items"));
  for (const d of eventsSnap.docs) {
    try { await deleteDoc(d.ref); } catch { /* ignore */ }
  }
}

export function watchIncomingEvents(
  targetClerkId: string,
  cb: (events: SyncEvent[]) => void,
) {
  return onSnapshot(
    collection(firestore, SYNC_EVENTS_COLLECTION, targetClerkId, "items"),
    (snap) => {
      const events: SyncEvent[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          eventId: data.eventId,
          sourceClerkId: data.sourceClerkId,
          targetClerkId,
          type: data.type,
          payload: data.payload,
          sourceUpdatedAt: data.sourceUpdatedAt,
          createdAt: data.createdAt,
        };
      });
      cb(events);
    },
  );
}
