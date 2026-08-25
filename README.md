# Driftline (Track A, Phase 3)

Trip tracking that survives the drop. Phase 3 adds the actual offline
*trip state* queue: trip events write to IndexedDB first and sync to the
server opportunistically, so a dropped connection can't lose one. Phase 4
(packaging: the polished sync-status badge, docs, LICENSE) is next. See
`PROGRESS.md` for full history.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Click **Start trip**.

## Verify Phase 3's "done when" criteria

1. **Events sync while online** — start a trip and watch the "Sync
   queue" card in the sidebar. Pending should stay near 0 and synced
   should climb as `trip.started`, location updates, and `trip.arrived`
   fire.
2. **Offline queues, doesn't lose events** — click **Simulate offline**,
   then start (or continue) a trip. Events should show as queued in the
   console and the pending count should climb; check DevTools → Network
   → your browser's console to confirm no `/api/trip-events` requests
   are firing while offline.
3. **Reconnect flushes in order** — click **Go back online**. The
   console should show `→ synced` lines in the same order the events
   were queued, and pending should drop to 0.
4. **A real network drop behaves the same way** — instead of the toggle,
   use DevTools → Network → Offline while a trip is running, then set it
   back to Online. Same result as #2/#3 — the toggle exists because
   `navigator.onLine` alone isn't reliable enough to demo on, not because
   it replaces a real offline test.

## Push to GitHub + deploy to Vercel

Same as before — commit and push, Vercel redeploys automatically:

```bash
git add .
git commit -m "Phase 3: offline trip-event queue"
git push
```

Then update `PROGRESS.md` with confirmation the four checks above passed
on the live URL, before starting Phase 4.

## Stack

- Next.js 14 (App Router) + TypeScript
- Leaflet + react-leaflet, OpenStreetMap raster tiles (single subdomain,
  pinned for cache consistency — see `PROGRESS.md`)
- Hand-rolled service worker (`public/sw.js`) — cache-first tiles,
  stale-while-revalidate app shell
- `idb` for the offline event queue (`lib/eventQueue.ts`) — optimistic
  IndexedDB write, ordered flush on reconnect, idempotency-keyed against
  `/api/trip-events`
- `/api/trip-events` now dedupes by idempotency key (in-memory, demo-grade)

