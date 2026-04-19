export type EventType =
  | "schedule.upsert"
  | "schedule.delete"
  | "log.upsert"
  | "log.delete"
  | "patient.roster.upsert"
  | "patient.roster.delete"
  | "link.create"
  | "link.remove";

export interface SyncEvent {
  eventId: string;
  sourceClerkId: string;
  targetClerkId: string;
  type: EventType;
  payload: Record<string, any>;
  sourceUpdatedAt: string;
  createdAt: string;
}

export interface OutboxRow {
  id: number;
  event_id: string;
  target_clerk_id: string;
  type: EventType;
  payload: string;
  source_updated_at: string;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

export interface PatientLink {
  patient_clerk_id: string;
  caretaker_clerk_id: string;
  linked_at: string;
}

export const USERS_COLLECTION = "users";
export const PAIRING_CODES_COLLECTION = "pairing_codes";
export const PATIENT_LINKS_COLLECTION = "patient_links";
export const SYNC_EVENTS_COLLECTION = "sync_events";
export const SNAPSHOTS_COLLECTION = "snapshots";
