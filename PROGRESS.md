# Build Progress

## Track A — Offline Map
- [x] Phase 1: Foundation
- [x] Phase 2: PWA + tile caching
- [x] Phase 3: Offline state sync
- [x] Phase 4: Packaging (built — cold-start test still needs to run on a live deploy, see entry below)

## Track B — WhatsApp Voice Booking Bot
- [ ] Phase B1: Sandbox + echo bot
- [ ] Phase B2: Voice understanding (Gemini)
- [ ] Phase B3: Mock booking + spoken reply (Gemini TTS)
- [ ] Phase B4: Packaging + pitch

## Decisions log
(most recent first — record tool used, what was built, choices made, what's next)

### 2026-08-29 — Claude.ai — Phase 4 built (packaging), cold-start test still pending on a live deploy

Cloned the repo first to check state before starting — matched this file
exactly, no drift, no reconciliation needed. Read the full Phase 3
hardening entry below before starting, per the note in that entry that
several of those bugs only surface in a real browser — kept that in mind
for what still needs live verification here too, not just what to build.

Built, against the packaging-for-resale checklist in SKILL.md:

- **Sync-status badge** (`app/page.tsx`, `app/globals.css`): a small
  pill in the top bar — `getSyncBadge()` derives one of `synced`,
  `pending — N`, or `offline — N queued` from the existing
  `queueSnapshot`/`offlineSim` state (no new state, no new subscription
  — reuses exactly what Phase 3 already tracks). Deliberately separate
  from the Phase 3 "Sync queue" sidebar card: that card stays as the
  detailed mechanism view; this badge is the "glanceable, proves the
  concept without reading code" element the checklist calls for.
  Wording is intentionally hedged ("pending", not "syncing") since a
  pending count while online could mean an in-flight request or a
  stalled one waiting to retry — "syncing" would overclaim certainty
  the client doesn't actually have. `aria-live="polite"` so the state
  change is announced for screen readers too.
- **`public/manifest.json`**: added the `"id"` field — one of the three
  "richer install UI" nice-to-haves flagged (not required) in the Phase
  3 hardening entry below. Skipped the other two on purpose: a
  wide-form-factor install screenshot needs a real browser to capture
  honestly (faking one would misrepresent the actual install UI), and
  protocol handlers don't apply to anything this app does.
- **`LICENSE`**: proprietary / all-rights-reserved, not MIT. Per
  SKILL.md's "contract fee, not idea fee" framing and this project's
  explicit pitch/resale intent (not a portfolio piece), the
  licensing/resale option from the packaging checklist fits better than
  an open license would. Owner name and contact are left as bracketed
  placeholders — needs a human decision, not something to guess at.
  Worth revisiting if this project's purpose ever shifts toward
  portfolio/reputation instead.
- **`PITCH.md`**: new one-page, non-technical pitch note, kept
  operator-agnostic per SKILL.md (doesn't name a specific target buyer),
  framed as "I'll build/integrate/maintain this for a fixed fee," and
  explicit about what's real (the offline mechanism, tested live) vs.
  what's a stand-in (the trip-dispatch backend). Deliberately a separate
  file from the technical README rather than one document trying to
  serve both audiences, per the checklist's "docs sized to the
  audience" item.
- **`README.md`**: rewritten for Phase 4 — describes the badge, adds a
  "before sending this anywhere" checklist (fill in LICENSE
  placeholders, decide proprietary vs. MIT, run the cold-start test),
  and gives the exact cold-start steps below since this sandbox can't
  run them itself.

**Verified:** `npx tsc --noEmit` passes clean on all changes.

**Not verified in this sandbox, same limitation as Phases 2 and 3**
(no egress from this container to `fonts.googleapis.com`, the live tile
server, or OSRM): a real `npm run build` — attempted, fails exactly at
the font fetch step (`next/font/google`) with no other errors surfaced
before that point — and the actual cold-start test the packaging
checklist calls for. That test needs a **fresh incognito window against
the live deployed URL**, specifically:
1. Confirm the sync badge shows `synced` and the sidebar queue card
   starts at `0 pending / 0 synced` on a totally clean load (no leftover
   service worker or IndexedDB from a prior session).
2. Download an area, force a real offline state (DevTools → Network →
   Offline, not the sim toggle), reload, confirm the shell and cached
   tiles still render.
3. Start a trip while genuinely offline, confirm the badge reads
   `offline — N queued`, reconnect, confirm it counts down to `synced`
   in the same order events were queued.
4. Re-run Phase 3's four sync-queue checks (listed in the 2026-08-25
   entry below) to confirm nothing about the badge changed the
   underlying queue behavior — it shouldn't have, since the badge only
   reads existing state, but that's exactly the kind of assumption the
   Phase 3 hardening round below found wrong before.

**Also not done, and flagged rather than silently skipped:** filling in
the actual name/contact in `LICENSE`, and deciding whether this stays
proprietary or moves to MIT — both are business decisions, not
something to default without asking.

**Where to resume:** run the cold-start test above on the live URL
(needs a browser — human or opencode, not Claude.ai), fill in the
`LICENSE` placeholders, then this build is pitch-ready. No Track A
phases remain after that. Track B (WhatsApp voice booking bot) hasn't
been started — Phase B1 (sandbox + echo bot) is next if that track
picks up.

### 2026-08-27 — Claude.ai + opencode — Phase 3 hardening (6 bugs found via live testing)
Everything below was found by actually clicking through the live deployed app — none of it was caught by tsc, unit tests, or code review alone. Recorded here in one entry since they were found and fixed across several back-and-forth rounds in the same session. Deployed via opencode from zips handed off by Claude.ai (per the multi-tool handoff pattern above — Claude.ai has no browser access, so all live verification in this entry was done by the human + opencode, not Claude.ai itself).

1. **Route crossed the sea.** `ROUTE_PATH` was never real routing — a Catmull-Rom curve through 5 hand-picked waypoints from Phase 1's "illustrative coordinates." Fixed by calling OSRM's free public routing API (`lib/tripData.ts: fetchLiveRoute()`), swapped in only if the trip hasn't started yet. The old curve became `FALLBACK_ROUTE_PATH`, used only if the live call fails.

2. **Pickup pin sat in the lagoon.** Turned out `PICKUP`'s coordinates were guessed, not verified — off by ~2.2km, landing in water. Fixed with real coordinates from Google Places (`PICKUP`/`DROPOFF` in `lib/tripData.ts`). Also replaced the hardcoded fallback waypoints with `generateFallbackWaypoints(a, b)`, generated FROM whatever PICKUP/DROPOFF currently are, so a future coordinate correction can't silently go stale the way the original hardcoded waypoints did.

3. **Fallback curve crossed the sea too, different cause.** PICKUP and DROPOFF sit almost on the same longitude, so the generic perpendicular bend in `generateFallbackWaypoints` was a coin flip between east/west — and it flipped west, into the lagoon that runs this entire corridor. Fixed by nudging east only (~150m), a deliberate, evidence-based choice for this specific Negombo coast corridor (confirmed west = water across multiple live screenshots), not a generic geometric assumption — flagged in code comments to re-check if PICKUP/DROPOFF ever move to a different corridor.

4. **Sync queue stuck "pending" forever while genuinely online.** `isOnline()` in `lib/eventQueue.ts` gated every flush attempt on `navigator.onLine` directly — which is exactly the value SKILL.md's Pattern A pitfall warns is unreliable. It misreported `false` on the user's actual browser/network while the connection was fine, silently blocking every flush with zero error or log. Fixed: the manual `simulateOffline` toggle is now the ONLY thing allowed to hold off a flush attempt; actual connectivity is decided by whether the fetch succeeds or throws, not by navigator.onLine. Confirmed with a test that fakes `navigator.onLine: false` while fetch succeeds — synced correctly after the fix, stuck forever before it.

5. **"Download this area" did nothing, zero console output.** Root cause turned out to be bug #6 below (map ref was always null) — but independently, the handler itself failed completely silently (`if (!viewport) return`, and the catch block swallowed errors with no log). Instrumented every failure/success path in `handleDownloadArea` (`app/page.tsx`) so this can never fail invisibly again, regardless of root cause.

6. **The actual root cause of #5, and also "Start trip" doing nothing: `mapRef.current` was always `null`.** `next/dynamic` (wrapping TripMap with `ssr:false`) does not reliably forward React's special `ref` prop to the component it loads, even when that component correctly uses `forwardRef` — a long-documented Next.js limitation (vercel/next.js#4957), not a bug in TripMap's own logic. Fixed by dropping `forwardRef` entirely: `TripMap` (`components/TripMap.tsx`) is now a plain function component taking `forwardedRef` as an ordinary prop, and `page.tsx` passes `forwardedRef={mapRef}` instead of `ref={mapRef}`. Regular props pass through `next/dynamic` fine — only the special `ref` prop was broken. `useImperativeHandle` doesn't care which way its ref argument arrived. Verified via a real Next dev server run in-sandbox (HTTP 200, no React ref warnings in the log) — actual browser confirmation came from the user afterward: trip animation and the sync queue both started working correctly.

7. **Offline fallback used a generated curve even when a real route was available.** Added a route cache: the first time OSRM succeeds, `fetchLiveRoute()` saves the real geometry to `localStorage`, keyed to the exact PICKUP/DROPOFF pair (so it can't be reused if those ever change). `route.ready` now reports one of three sources — `live`, `cached`, or `fallback` — and TripMap tries them in that order. Verified live: offline load correctly showed "cached real route from an earlier session (100 pts)," not the generated curve.

**Also worth knowing for Phase 4:** the manifest currently shows Chrome's optional "richer install UI" suggestions (a wide-form-factor screenshot, an explicit `id` field, protocol handlers) — these are NOT installability errors, just nice-to-haves. Worth picking up during Phase 4 packaging if polish time allows, not a blocker.

**Not verified by Claude.ai in this entry** (no browser access from that side): the exact live sequence of cache tiers (online → live route → force offline → cached route, not fallback) — confirmed working by the user/opencode afterward, see bullet 7 above.

**Where to resume:** Phase 4 (packaging — the real sync-status badge, docs, LICENSE, cold-start test). Read this whole entry before starting; several of these fixes (especially #4 and #6) are the kind of thing that looks fine in code review and only breaks in a real browser — worth keeping that in mind for how Phase 4 gets verified too, not just built.

### 2026-08-25 — Claude.ai — Phase 3 complete
Cloned the repo to check state before starting — no drift from Phase 2, matches this file. Note: `pickme-build-prompt.md`, referenced below as "where to resume," isn't actually in the repo (only SKILL.md, README.md, PROGRESS.md are). Built this phase off SKILL.md's Pattern A architecture instead, which was detailed enough on its own. Worth checking whether that file exists locally and just never got committed — if it has phase-specific "done when" criteria beyond what's below, Phase 4 should start from those instead.

Built:
- `lib/eventQueue.ts`: the offline event queue. `enqueueEvent()` writes optimistically to IndexedDB (via the `idb` package) and returns instantly; `flushQueue()` replays pending events oldest-first and stops at the first failure so a later event can never land before an earlier one (location updates are meaningless out of order). Reconnect (`window`'s `online` event) and a manual `setSimulateOffline()` toggle both trigger a flush attempt.
- Each queued event carries a client-generated `id` (idempotency key).
- `app/api/trip-events/route.ts`: added dedup on that `id` via an in-memory `seen` map — a retried event (flaky reconnect, response lost after the server actually received it) comes back as a harmless `duplicate: true` instead of being processed twice. In-memory only, noted in the code as demo-grade, not a real datastore.
- `app/page.tsx`: replaced the direct `fetch` calls in `handleEvent` with `enqueueEvent`; added a "Sync queue" card with live pending/synced counts and a "Simulate offline" button — addresses the SKILL.md pitfall about `navigator.onLine` alone being unreliable for a live demo. This is a functional readout only, not the polished "glanceable" sync-status badge the packaging checklist calls for — that's still Phase 4's job, this just makes the mechanism visible/testable now.
- `components/TripConsole.tsx` / `globals.css`: added a `sync` log tag (amber) for queue transitions, distinct from `req`/`evt`/`err`.

**Bug caught by testing, fixed before committing:** the first cut of the queue ordered the flush by a `clientTs`-indexed IndexedDB index. Two events queued in the same millisecond (e.g. rapid-fire location updates) got an identical `clientTs`, and IndexedDB then broke the tie by sorting on the primary key — a random UUID — silently scrambling flush order. Fixed by switching the store to an out-of-line **auto-incrementing** primary key and flushing in ascending key order, which is guaranteed to match insertion order exactly. No more clientTs-based index.

**Verified:** `npx tsc --noEmit` passes clean. Wrote two throwaway Node smoke tests (deleted after, not committed — used `fake-indexeddb` + a faked `fetch`/`navigator` to exercise the logic without a browser): one exercising `eventQueue.ts` directly (online sync, offline queuing, ordered reconnect flush including the bug above, failure-then-retry recovery, and recovery from a genuine network exception vs. just the sim-offline toggle — 8 assertions, all passing), one exercising the route's dedup logic directly via `NextRequest` (first-submission vs. duplicate-id vs. a different id vs. missing `type` — 4 assertions, all passing).

**Not verified in this sandbox** (same limitation as Phase 2 — no egress from this container to the services involved, this time `fonts.googleapis.com` for `next/font`): a real `npm run build`, and the actual in-browser behavior — DevTools → Network → Offline while a trip is running, confirming events queue and then flush in order on reconnect, and confirming a page reload mid-offline doesn't lose queued events (IndexedDB persistence across reloads was not exercised, only the logic within a single process run).

**Where to resume:** Phase 4 (packaging — the real sync-status badge, docs, LICENSE, cold-start test) once Phase 3 is pushed and the live checks above pass on the deployed URL.

### 2026-08-24 — Claude.ai — Phase 2 complete
Confirmed live URL working (https://pickme-ruby.vercel.app) and cloned the repo to check state before starting — no drift from Phase 1, just the deployment log entry below. Good, no reconciliation needed.

Built:
- `public/manifest.json` + `public/icons/` (192/512/apple-touch, generated with Pillow to match the app's own design tokens — a curved teal route glyph on the navy background, same motif as the on-map route line).
- `public/sw.js`: hand-rolled service worker (not next-pwa — full control over the two caching strategies without a Workbox black box). Cache-first for OSM tiles (`driftline-tiles-v1`, capped at 800 entries, FIFO eviction — addresses the "uncapped tile cache growth" pitfall from SKILL.md). Stale-while-revalidate for the app shell / `_next/static` / navigations (`driftline-shell-v1`) so a reload while offline still renders something. `/api/*` is left untouched — Phase 3's job.
- Pinned the live `TileLayer` to a single subdomain (`a.tile.openstreetmap.org`, no `{s}` rotation). This matters: the "download this area" pre-fetch and the SW's cache-first lookup both key on exact request URL, so pre-fetched tiles would silently miss the cache if Leaflet later requested a different `{s}` subdomain for the same tile.
- `lib/offlineTiles.ts`: slippy-map tile math + a concurrency-capped (6 at a time, polite to the free tile server) downloader that writes directly into the SW's cache via the Cache Storage API — no message-passing to the SW needed, since page and SW share one origin's caches.
- "Download this area for offline use" button + progress bar in the side panel, using the map's *current* bounds/zoom ± 1 (3 zoom levels, per spec) at click time.
- Tile-error banner: Leaflet's `tileerror` event on the TileLayer triggers a visible "some tiles aren't cached" message over the map — satisfies "uncached areas show a clear message instead of failing silently" without needing a full online/offline detector (that's Phase 4's Sync Status badge, deliberately not duplicated here).
- Fixed a dev-only bug found while testing: React Strict Mode's mount -> cleanup -> remount cycle in `next dev` was double-logging `trip.requested` in the console panel. Guarded with a ref so it fires once regardless of Strict Mode. Doesn't affect production (Strict Mode's double-invoke is dev-only), but would've been a confusing false alarm for anyone reviewing locally, so fixed rather than left for Phase 4.

**Verified:** `npm install` + `npm run build` succeed with no errors. Also ran `next dev` + a headless-browser smoke test: confirmed the zoom control isn't covered by the tile banner, and the event console shows exactly one `trip.requested` line after the Strict Mode fix. **Not verified in this sandbox** (no egress to tile.openstreetmap.org from this container): the actual "download this area" happy path, and the Lighthouse installability check. Both need a real check once pushed — see the updated README for exact steps (DevTools → Application → Manifest, and DevTools → Lighthouse → PWA).

**Where to resume:** Phase 3 (offline state sync — IndexedDB queue, idempotency keys, reconnect flush) in `pickme-build-prompt.md`.

### 2026-08-24 — Claude.ai — Phase 1 complete
Built the Next.js (App Router, TS) foundation:
- `app/page.tsx` + `components/TripMap.tsx`: Leaflet/OSM map, mock trip between two real Negombo landmarks (Beach Park → Clock Tower), route drawn as a Catmull-Rom curve (not a straight line) so it reads as a road. "Start trip" animates a tuk-tuk marker along the curve; the drawn polyline extends as it goes.
- `components/TripConsole.tsx`: dispatch-terminal-style event log — this is the demo's signature element and doubles as groundwork for the Phase 3 sync-status badge (same event stream, different rendering).
- `app/api/trip-events/route.ts`: stub POST endpoint. Accepts `{tripId, type, payload, clientTs}`, logs it, returns 202. No persistence — that's Phase 3's job (IndexedDB queue + real sync). Kept the request shape stable now so Phase 3 doesn't need a breaking change.
- Design direction: dark "dispatch console" theme (deep navy `#0b1220`, teal `#37d6c4` accent for active/en-route, amber `#f2b84b` for pickup/waiting) — Inter for UI, JetBrains Mono for data/log text. Chosen to fit the subject (a connectivity/telemetry demo) rather than a generic light SaaS look.
- Verified: `npm install` + `npm run build` succeed with no errors.

**Not done yet, on purpose:** no service worker, no offline tile caching, no IndexedDB queue, no PWA manifest — that's Phases 2–3. This phase is deliberately "boring plumbing only."

**Where to resume:** Phase 2 (PWA + tile caching) in `pickme-build-prompt.md`.

### 2026-08-24 — Deployment complete
- GitHub repo created: https://github.com/shanujans/pickme (private)
- Vercel deployment live: https://pickme-ruby.vercel.app
- Build passed on Vercel with no errors
- Ready for Phase 2 (PWA + tile caching)

### 2026-08-25 — Phase 2 deployed
- Vercel deployment updated: https://pickme-ruby.vercel.app
- Phase 2 (PWA + offline tile caching) live
- All three verification criteria need manual check on live URL:
  1. Application → Manifest shows Driftline with icons (no errors)
  2. Download area → go offline → map still renders downloaded tiles
  3. Pan to uncached area offline → amber "some tiles aren't cached" banner shows

### 2026-08-25 — Phase 3 deployed
- Vercel deployment updated: https://pickme-ruby.vercel.app
- Phase 3 (offline trip-event queue) live
- Four verification criteria need manual check on live URL:
  1. Events sync while online — start trip, pending stays ~0, synced climbs
  2. Offline queues — click "Simulate offline", start trip, events queue locally
  3. Reconnect flushes in order — click "Go back online", events sync in order
  4. Real network drop behaves same — DevTools Network → Offline, then Online