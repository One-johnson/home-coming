/**
 * Desk check-ins taken while the building's station is offline (Phase 2 §19).
 *
 * The queue lives on the device, not the server — that is the whole point of a
 * dead zone. Each entry carries the transaction id the server dedupes on, so a
 * replay that is repeated (tap twice, tab reopened) still checks a delegate in
 * once. Nothing here talks to Convex: the desk decides when to push, and the
 * server decides whether each transaction applies or needs review.
 */

export type QueuedDeskCheckIn = {
  /** Client-generated id; the server stores a transaction once per id. */
  txId: string;
  guestId: string;
  /** Kept for the desk's own list — the server resolves the real record. */
  guestName: string;
  /** Building whose designated station may queue this transaction. */
  building: string;
  /** Desk location recorded on the arrival. */
  location: string;
  /** Who takes the key, for key-tracked rooms. */
  keyRecipientName?: string;
  /** Staff member who took the arrival, so the replay keeps their identity. */
  staffId?: string;
  staffRole?: string;
  originalAt: number;
};

/** The slice of Storage the queue needs, so tests can pass a plain object. */
export type QueueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const QUEUE_STORAGE_KEY = "homecoming-desk-offline-checkins-v1";

function resolveStorage(storage?: QueueStorage | null): QueueStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Private mode / storage disabled — the queue simply cannot persist.
    return null;
  }
}

function isEntry(value: unknown): value is QueuedDeskCheckIn {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.txId === "string" &&
    entry.txId.length > 0 &&
    typeof entry.guestId === "string" &&
    entry.guestId.length > 0 &&
    typeof entry.building === "string" &&
    typeof entry.location === "string" &&
    typeof entry.originalAt === "number"
  );
}

/**
 * Build a queue entry for one arrival. The time and transaction id are made
 * here rather than in the component, so the desk's render stays pure.
 */
export function queuedCheckInEntry(input: {
  guestId: string;
  guestName: string;
  building: string;
  location: string;
  keyRecipientName?: string;
  staffId?: string;
  staffRole?: string;
}): QueuedDeskCheckIn {
  return {
    ...input,
    txId: newOfflineTxId(),
    originalAt: Date.now(),
  };
}

/** This device's queue, oldest first. Unreadable storage reads as empty. */
export function loadQueuedCheckIns(
  storage?: QueueStorage | null,
): QueuedDeskCheckIn[] {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).sort((a, b) => a.originalAt - b.originalAt);
  } catch {
    return [];
  }
}

function write(rows: QueuedDeskCheckIn[], storage?: QueueStorage | null) {
  const store = resolveStorage(storage);
  if (!store) return rows;
  try {
    store.setItem(QUEUE_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Quota or private mode — the desk keeps its in-memory copy.
  }
  return rows;
}

/** Add one check-in to the device queue, replacing any entry for that guest. */
export function enqueueCheckIn(
  entry: QueuedDeskCheckIn,
  storage?: QueueStorage | null,
): QueuedDeskCheckIn[] {
  // One queued arrival per delegate: a second tap must not store a second tx.
  const rows = loadQueuedCheckIns(storage).filter(
    (row) => row.guestId !== entry.guestId,
  );
  rows.push(entry);
  return write(
    rows.sort((a, b) => a.originalAt - b.originalAt),
    storage,
  );
}

/** Drop entries the server has taken (applied, conflict or rejected). */
export function removeQueuedCheckIns(
  txIds: string[],
  storage?: QueueStorage | null,
): QueuedDeskCheckIn[] {
  const drop = new Set(txIds);
  const rows = loadQueuedCheckIns(storage).filter((row) => !drop.has(row.txId));
  return write(rows, storage);
}

/** A transaction id the server can dedupe on. */
export function newOfflineTxId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Older browsers without randomUUID still get an id that is unique enough
  // for a desk queue (time + randomness), never reused across devices.
  return `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
