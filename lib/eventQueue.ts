// Offline-safe trip-event queue. Implements the Pattern A shape from
// SKILL.md:
//   action -> IndexedDB (instant) -> try POST -> success: synced
//                                   | fail/offline: stays "pending"
//                                   -> flush in order on reconnect
//
// Each event gets a client-generated id that doubles as a server-side
// idempotency key (see app/api/trip-events/route.ts), which is what
// keeps a flaky reconnect from double-submitting the same event.

import { openDB, DBSchema, IDBPDatabase } from "idb";

export type QueuedEvent = {
  id: string; // idempotency key sent to the server — NOT the DB primary key
  tripId: string;
  type: string;
  payload: Record<string, unknown>;
  clientTs: string; // ISO string, informational only — see note below
  status: "pending" | "synced";
  attempts: number;
};

interface DriftlineDB extends DBSchema {
  events: {
    key: number; // auto-incrementing insertion sequence (out-of-line key)
    value: QueuedEvent;
  };
}

const DB_NAME = "driftline-events";
const DB_VERSION = 1;
const STORE = "events";

let dbPromise: Promise<IDBPDatabase<DriftlineDB>> | null = null;

function getDB() {
  if (typeof window === "undefined") {
    throw new Error("Event queue is client-only.");
  }
  if (!dbPromise) {
    dbPromise = openDB<DriftlineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Out-of-line auto-increment key, not keyPath: "id". Two events
        // queued in the same millisecond get an identical clientTs, so
        // ordering by a clientTs index would fall back to sorting by the
        // (random) id on ties — actually scrambling flush order. The
        // store's own auto-increment key is strictly monotonic and
        // matches insertion order exactly, so flushing in ascending
        // primary-key order is what "flush in order on reconnect" means.
        db.createObjectStore(STORE, { autoIncrement: true });
      },
    });
  }
  return dbPromise;
}

function makeId(): string {
  // crypto.randomUUID covers every browser this demo targets; falls back
  // just in case (e.g. non-HTTPS local testing where it's unavailable).
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type QueueSnapshot = { pending: number; synced: number };

type Listener = (snapshot: QueueSnapshot, event?: QueuedEvent) => void;
const listeners = new Set<Listener>();

export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function notify(event?: QueuedEvent) {
  const snapshot = await getSnapshot();
  listeners.forEach((l) => l(snapshot, event));
}

export async function getSnapshot(): Promise<QueueSnapshot> {
  const db = await getDB();
  const all = await db.getAll(STORE);
  return {
    pending: all.filter((e) => e.status === "pending").length,
    synced: all.filter((e) => e.status === "synced").length,
  };
}

// SKILL.md pitfall: don't trust navigator.onLine alone — pair it with a
// manual demo toggle, since a real live-audience demo can't depend on
// someone finding DevTools' network throttler. Either being "offline"
// holds off the flush.
let simulateOffline = false;

export function setSimulateOffline(value: boolean) {
  simulateOffline = value;
  if (!value) {
    void flushQueue();
  } else {
    void notify();
  }
}

export function isSimulatingOffline() {
  return simulateOffline;
}

// SKILL.md pitfall: don't trust navigator.onLine alone. The previous
// version went further than intended — it used navigator.onLine as a
// hard gate that blocked every flush attempt when it read `false`, even
// though navigator.onLine is known to misreport `false` on some
// browser/network/VPN combinations while the connection is genuinely
// fine. That silently stuck events in "pending" forever with no error,
// no log, nothing to debug against — exactly the failure mode the
// pitfall warns about. The fix: the manual `simulateOffline` toggle
// (isSimulatingOffline, above) is the only thing allowed to hold off a
// flush attempt. Whether we're *actually* online is decided by whether
// the fetch below succeeds or throws — the only ground truth that
// exists — not by a browser API known to lie.

async function postToServer(e: QueuedEvent): Promise<boolean> {
  const res = await fetch("/api/trip-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: e.id,
      tripId: e.tripId,
      type: e.type,
      payload: e.payload,
      clientTs: e.clientTs,
    }),
  });
  return res.ok;
}

let flushing = false;

// Walks pending events in insertion order and stops at the first failure
// so a later event can never land on the server before an earlier one —
// matters here because out-of-order location updates would be
// meaningless. The stopped-at event is retried first on the next flush.
//
// Reads pending records (with their keys) in one short read-only
// transaction, then updates one at a time in their own transactions —
// deliberately NOT one long-lived transaction spanning the network
// requests, since IndexedDB auto-commits a transaction that goes idle
// waiting on a non-IDB async op like fetch().
export async function flushQueue(): Promise<void> {
  if (flushing || isSimulatingOffline()) return;
  flushing = true;

  try {
    const db = await getDB();
    const tx = db.transaction(STORE, "readonly");
    const entries: { key: number; value: QueuedEvent }[] = [];
    let cursor = await tx.store.openCursor(); // ascending key = insertion order
    while (cursor) {
      if (cursor.value.status === "pending") {
        entries.push({ key: cursor.key, value: cursor.value });
      }
      cursor = await cursor.continue();
    }
    await tx.done;

    for (const { key, value } of entries) {
      if (isSimulatingOffline()) break;
      try {
        const ok = await postToServer(value);
        if (!ok) {
          value.attempts += 1;
          await db.put(STORE, value, key);
          break;
        }
        value.status = "synced";
        await db.put(STORE, value, key);
        await notify(value);
      } catch {
        // Offline mid-flush, or a genuine network error — stop here and
        // let the next trigger (reconnect, toggle, new event) retry.
        value.attempts += 1;
        await db.put(STORE, value, key);
        break;
      }
    }
  } finally {
    flushing = false;
    await notify();
  }
}

// Optimistic write: lands in IndexedDB instantly and never throws — the
// point of the queue is that a dropped connection can't lose the event.
// A flush is then attempted opportunistically in case we're online.
export async function enqueueEvent(
  tripId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<QueuedEvent> {
  const event: QueuedEvent = {
    id: makeId(),
    tripId,
    type,
    payload,
    clientTs: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };

  const db = await getDB();
  await db.add(STORE, event);
  await notify(event);

  void flushQueue();

  return event;
}

// Call once from the page: flushes automatically whenever the browser
// reports coming back online.
export function initReconnectFlush(): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => void flushQueue();
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}
