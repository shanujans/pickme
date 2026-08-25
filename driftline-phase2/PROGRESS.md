# Build Progress

## Track A — Offline Map
- [x] Phase 1: Foundation
- [x] Phase 2: PWA + tile caching
- [ ] Phase 3: Offline state sync
- [ ] Phase 4: Packaging

## Track B — WhatsApp Voice Booking Bot
- [ ] Phase B1: Sandbox + echo bot
- [ ] Phase B2: Voice understanding (Gemini)
- [ ] Phase B3: Mock booking + spoken reply (Gemini TTS)
- [ ] Phase B4: Packaging + pitch

## Decisions log
(most recent first — record tool used, what was built, choices made, what's next)

### 2026-08-24 — Claude.ai — Phase 2 complete
Confirmed live URL working (https://pickme-ruby.vercel.app) and cloned the
repo to check state before starting — no drift from Phase 1, just the
deployment log entry below. Good, no reconciliation needed.

Built:
- `public/manifest.json` + `public/icons/` (192/512/apple-touch, generated
  with Pillow to match the app's own design tokens — a curved teal route
  glyph on the navy background, same motif as the on-map route line).
- `public/sw.js`: hand-rolled service worker (not next-pwa — full control
  over the two caching strategies without a Workbox black box). Cache-first
  for OSM tiles (`driftline-tiles-v1`, capped at 800 entries, FIFO eviction
  — addresses the "uncapped tile cache growth" pitfall from SKILL.md).
  Stale-while-revalidate for the app shell / `_next/static` / navigations
  (`driftline-shell-v1`) so a reload while offline still renders something.
  `/api/*` is left untouched — Phase 3's job.
- Pinned the live `TileLayer` to a single subdomain
  (`a.tile.openstreetmap.org`, no `{s}` rotation). This matters: the
  "download this area" pre-fetch and the SW's cache-first lookup both key
  on exact request URL, so pre-fetched tiles would silently miss the cache
  if Leaflet later requested a different `{s}` subdomain for the same tile.
- `lib/offlineTiles.ts`: slippy-map tile math + a concurrency-capped (6 at
  a time, polite to the free tile server) downloader that writes directly
  into the SW's cache via the Cache Storage API — no message-passing to
  the SW needed, since page and SW share one origin's caches.
- "Download this area for offline use" button + progress bar in the side
  panel, using the map's *current* bounds/zoom ± 1 (3 zoom levels, per
  spec) at click time.
- Tile-error banner: Leaflet's `tileerror` event on the TileLayer triggers
  a visible "some tiles aren't cached" message over the map — satisfies
  "uncached areas show a clear message instead of failing silently"
  without needing a full online/offline detector (that's Phase 4's
  Sync Status badge, deliberately not duplicated here).
- Fixed a dev-only bug found while testing: React Strict Mode's mount ->
  cleanup -> remount cycle in `next dev` was double-logging
  `trip.requested` in the console panel. Guarded with a ref so it fires
  once regardless of Strict Mode. Doesn't affect production (Strict Mode's
  double-invoke is dev-only), but would've been a confusing false alarm
  for anyone reviewing locally, so fixed rather than left for Phase 4.

**Verified:** `npm install` + `npm run build` succeed with no errors.
Also ran `next dev` + a headless-browser smoke test: confirmed the zoom
control isn't covered by the tile banner, and the event console shows
exactly one `trip.requested` line after the Strict Mode fix.
**Not verified in this sandbox** (no egress to tile.openstreetmap.org from
this container): the actual "download this area" happy path, and the
Lighthouse installability check. Both need a real check once pushed — see
the updated README for exact steps (DevTools → Application → Manifest,
and DevTools → Lighthouse → PWA).

**Where to resume:** Phase 3 (offline state sync — IndexedDB queue,
idempotency keys, reconnect flush) in `pickme-build-prompt.md`.

### 2026-08-24 — Claude.ai — Phase 1 complete
Built the Next.js (App Router, TS) foundation:
- `app/page.tsx` + `components/TripMap.tsx`: Leaflet/OSM map, mock trip between
  two real Negombo landmarks (Beach Park → Clock Tower), route drawn as a
  Catmull-Rom curve (not a straight line) so it reads as a road. "Start trip"
  animates a tuk-tuk marker along the curve; the drawn polyline extends as it
  goes.
- `components/TripConsole.tsx`: dispatch-terminal-style event log — this is
  the demo's signature element and doubles as groundwork for the Phase 3
  sync-status badge (same event stream, different rendering).
- `app/api/trip-events/route.ts`: stub POST endpoint. Accepts
  `{tripId, type, payload, clientTs}`, logs it, returns 202. No persistence —
  that's Phase 3's job (IndexedDB queue + real sync). Kept the request shape
  stable now so Phase 3 doesn't need a breaking change.
- Design direction: dark "dispatch console" theme (deep navy `#0b1220`,
  teal `#37d6c4` accent for active/en-route, amber `#f2b84b` for
  pickup/waiting) — Inter for UI, JetBrains Mono for data/log text. Chosen
  to fit the subject (a connectivity/telemetry demo) rather than a generic
  light SaaS look.
- Verified: `npm install` + `npm run build` succeed with no errors.

**Not done yet, on purpose:** no service worker, no offline tile caching, no
IndexedDB queue, no PWA manifest — that's Phases 2–3. This phase is
deliberately "boring plumbing only."

**Where to resume:** Phase 2 (PWA + tile caching) in `pickme-build-prompt.md`.

### 2026-08-24 — Deployment complete
- GitHub repo created: https://github.com/shanujans/pickme (private)
- Vercel deployment live: https://pickme-ruby.vercel.app
- Build passed on Vercel with no errors
- Ready for Phase 2 (PWA + tile caching)
