# Driftline (Phase 4 — packaged)

Trip tracking that survives the drop. A working prototype demonstrating
offline-resilient trip tracking for ride-hailing/delivery apps: cached
map tiles, a queued-and-ordered trip-event sync, and a glanceable
sync-status indicator — all verified against real network drops, not
just simulated in code. See `PROGRESS.md` for full build history and
`PITCH.md` for the non-technical, business-facing version of this
document.

## What's in Phase 4

- **Sync-status badge** (top bar): a single glanceable indicator —
  `synced`, `pending — N`, or `offline — N queued` — that answers "is
  this surviving the drop right now?" without reading the console or
  the sidebar. Separate on purpose from the detailed "Sync queue" card
  in the sidebar, which stays as the mechanism made visible/testable
  for anyone who wants to dig in.
- **LICENSE**: proprietary / all-rights-reserved (this is a
  pitch/resale prototype, not a portfolio piece — see `LICENSE` and
  fill in the owner name/contact before sending to anyone).
- **PITCH.md**: a one-page, non-technical pitch note for a business
  contact. Keep this and the technical docs separate — don't send this
  README to a non-technical buyer, and don't send `PITCH.md` to an
  engineer evaluating the code.
- Small manifest polish: added an explicit `"id"` field (one of the
  "richer install UI" nice-to-haves flagged during Phase 3 hardening).
  Skipped the other two from that list on purpose: a wide-form-factor
  install screenshot needs a real browser to capture honestly, and
  protocol handlers don't apply to this app — not worth faking either.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Click **Start trip**.

## Verify Phase 4's "done when" criteria

1. **Sync badge reflects reality, not just the sidebar card.** Start a
   trip. The top-bar badge should read `synced` while online, flip to
   `pending — N` momentarily as events queue, then settle back to
   `synced`. Click **Simulate offline** in the sidebar and start/continue
   a trip — the badge should switch to `offline — N queued` and climb as
   events queue. Click **Go back online** — the badge should count back
   down to `synced` as the queue flushes in order.
2. **Manifest / installability still clean.** DevTools → Application →
   Manifest: no errors, the new `id` field present, icons load. DevTools
   → Lighthouse → PWA: installable.
3. **Cold-start test (do this on the deployed URL, in a *fresh incognito
   window* — not this dev environment).** This sandbox has no network
   route to Google Fonts or the live tile/OSRM services, so it cannot
   run `next build` or exercise a real browser — this step has to happen
   wherever the app is actually deployed:
   - Open the live URL in a brand-new incognito window (no cached
     service worker, no IndexedDB from a prior session).
   - Confirm the map loads, the sync badge shows `synced`, and the
     "Sync queue" card starts at `0 pending / 0 synced`.
   - Click **Download this area for offline use**, then go offline
     (DevTools → Network → Offline, not just the sim toggle) and reload
     — confirm the shell and cached tiles still render.
   - Start a trip while offline, confirm the badge shows `offline — N
     queued`, then go back online and confirm it counts down to `synced`
     in the same order the events were queued.
4. **Everything from Phase 3's checklist still holds** — see the four
   sync-queue checks in `PROGRESS.md`'s Phase 3 entries; nothing about
   the queue's logic changed in Phase 4, only how its state is surfaced.

## Push to GitHub + deploy to Vercel

```bash
git add .
git commit -m "Phase 4: sync-status badge, LICENSE, PITCH.md, manifest polish"
git push
```

Then run the cold-start test above against the live URL and record the
result in `PROGRESS.md` before calling Phase 4 (and this build) done.

## Before sending this anywhere

- [ ] Fill in `[YOUR NAME OR COMPANY NAME]` and `[YOUR CONTACT EMAIL]`
      in `LICENSE` — currently placeholders.
- [ ] Re-read `PITCH.md` and swap in your own contact details / framing
      if you're pitching a specific operator rather than sending it
      cold.
- [ ] Run the cold-start test above and update `PROGRESS.md`.
- [ ] Decide if `LICENSE` should stay proprietary (resale/licensing
      pitch) or switch to MIT (if this ever becomes a portfolio piece
      instead) — see SKILL.md's packaging checklist for the trade-off.

## Stack

- Next.js 14 (App Router) + TypeScript
- Leaflet + react-leaflet, OpenStreetMap raster tiles (single subdomain,
  pinned for cache consistency), live OSRM road routing with a cached
  and generated-curve fallback chain
- Hand-rolled service worker (`public/sw.js`) — cache-first tiles,
  stale-while-revalidate app shell
- `idb` for the offline event queue (`lib/eventQueue.ts`) — optimistic
  IndexedDB write, ordered flush on reconnect, idempotency-keyed against
  `/api/trip-events`, gated only by a manual offline-sim flag (never by
  `navigator.onLine` directly — see `PROGRESS.md` for why)
- `/api/trip-events` dedupes by idempotency key (in-memory, demo-grade)
