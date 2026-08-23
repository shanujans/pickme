# Build Progress

## Track A — Offline Map
- [x] Phase 1: Foundation
- [ ] Phase 2: PWA + tile caching
- [ ] Phase 3: Offline state sync
- [ ] Phase 4: Packaging

## Track B — WhatsApp Voice Booking Bot
- [ ] Phase B1: Sandbox + echo bot
- [ ] Phase B2: Voice understanding (Gemini)
- [ ] Phase B3: Mock booking + spoken reply (Gemini TTS)
- [ ] Phase B4: Packaging + pitch

## Decisions log
(most recent first — record tool used, what was built, choices made, what's next)

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
