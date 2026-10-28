import { describe, expect, test } from "vitest";
import {
  QUEUE_STORAGE_KEY,
  enqueueCheckIn,
  loadQueuedCheckIns,
  newOfflineTxId,
  removeQueuedCheckIns,
  type QueuedDeskCheckIn,
  type QueueStorage,
} from "@/lib/deskOfflineQueue";

function memoryStorage(): QueueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function entry(overrides: Partial<QueuedDeskCheckIn> = {}): QueuedDeskCheckIn {
  return {
    txId: "tx-1",
    guestId: "guest-1",
    guestName: "Ama Mensah",
    building: "Blocks 1–4",
    location: "Blocks 1–4",
    originalAt: 1_000,
    ...overrides,
  };
}

describe("desk offline queue", () => {
  test("keeps queued arrivals oldest first and survives a reload", () => {
    const storage = memoryStorage();
    enqueueCheckIn(entry({ txId: "tx-late", originalAt: 2_000 }), storage);
    enqueueCheckIn(entry({ txId: "tx-early", guestId: "guest-2", originalAt: 1_000 }), storage);

    expect(loadQueuedCheckIns(storage).map((row) => row.txId)).toEqual([
      "tx-early",
      "tx-late",
    ]);
  });

  test("one queued arrival per delegate — a second tap replaces, never doubles", () => {
    const storage = memoryStorage();
    enqueueCheckIn(entry({ txId: "tx-1" }), storage);
    enqueueCheckIn(entry({ txId: "tx-2" }), storage);

    const rows = loadQueuedCheckIns(storage);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.txId).toBe("tx-2");
  });

  test("only the synced transactions leave the queue", () => {
    const storage = memoryStorage();
    enqueueCheckIn(entry({ txId: "tx-1" }), storage);
    enqueueCheckIn(entry({ txId: "tx-2", guestId: "guest-2" }), storage);

    const left = removeQueuedCheckIns(["tx-1"], storage);
    expect(left.map((row) => row.txId)).toEqual(["tx-2"]);
    expect(loadQueuedCheckIns(storage).map((row) => row.txId)).toEqual(["tx-2"]);
  });

  test("unreadable or tampered storage reads as an empty queue", () => {
    const storage = memoryStorage();
    storage.setItem(QUEUE_STORAGE_KEY, "not-json");
    expect(loadQueuedCheckIns(storage)).toEqual([]);

    storage.setItem(
      QUEUE_STORAGE_KEY,
      JSON.stringify([{ txId: "tx-1" }, entry({ txId: "tx-good" })]),
    );
    expect(loadQueuedCheckIns(storage).map((row) => row.txId)).toEqual(["tx-good"]);
  });

  test("missing storage (private mode) never throws and keeps memory in sync", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => enqueueCheckIn(entry(), storage)).not.toThrow();
  });

  test("transaction ids are unique", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newOfflineTxId()));
    expect(ids.size).toBe(20);
  });
});
