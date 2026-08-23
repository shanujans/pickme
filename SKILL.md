---
name: mobility-gap-filler-prototypes
description: Playbook for researching feature gaps in ride-hailing/delivery/mobility apps and building phased, resale-ready prototypes that fill them — offline-first PWAs (offline maps, queued state sync) and WhatsApp/voice-based booking bots (WhatsApp Cloud API, Gemini speech understanding, Gemini TTS) — plus how to keep a build coherent when it's continued across multiple AI coding tools in the same project (e.g. starting in Claude.ai, continuing in OpenCode, finishing in AI Studio). Use this whenever building a mobility-app feature demo meant for a pitch, portfolio, or resale — even if the user just says "make it work offline," "build a WhatsApp bot," or "build a demo to sell" — and especially whenever a build will span more than one AI tool or session, or needs to run at zero cost.
---

# Mobility App Gap-Filler Prototypes

Playbook for building — and packaging for resale — prototype features that fill a real gap in an existing ride-hailing, delivery, or mobility app. Grew out of researching PickMe's Directional Travel feature and finding two gaps: no offline resilience, and no low-tech-literacy booking path.

## When this applies
- Building a demo/prototype whose end goal is a pitch, a portfolio piece, or resale/licensing — not just a personal learning project.
- "Make this work without internet," "offline mode," "connectivity resilience," "PWA," "works in low-signal areas" → see Pattern A.
- "WhatsApp bot," "voice booking," "book by voice note," "works for people who struggle with the app" → see Pattern B.
- Any build that will be continued across more than one AI tool or session → see the handoff section below, regardless of pattern.

## The core principle: contract fee, not idea fee
Companies don't pay cash for an unsolicited idea — legal risk means they almost never will, no matter how good it is. They do pay for delivered, working code and for contracted maintenance. Every prototype in this family should end with a pitch framed as "I'll build/license/maintain X for a fixed fee," never "buy my idea." The working prototype is the leverage — don't describe the concept in detail before there's a working demo or a signed agreement.

## Building across multiple AI tools in one project
None of Claude.ai, OpenCode, AI Studio, Cursor, etc. share memory with each other or across sessions. **The repo is the only shared brain.** Whenever a build spans more than one tool:

- Keep a `PROGRESS.md` at the repo root: a checklist of phases plus a dated decisions log (tool used, what was built, choices made, where to resume).
- Before starting any phase in any tool: have it read `PROGRESS.md` and the specific phase spec first; state explicitly what's already done.
- After every phase in any tool: make sure code is actually committed and pushed before switching tools. Chat-only tools (Claude.ai, AI Studio) can't push to a repo themselves — the human has to copy the code out and push it manually. This step is the most common point of failure in a multi-tool build; the next tool otherwise opens an empty or stale repo.

## Ship every prototype in phases, not one shot
Regardless of pattern: prove the plumbing first (deployed, boring, happy-path only), then add the actual differentiating logic, then package for the pitch. Make the AI tool stop and show working output after each phase before continuing — this is what keeps a vibecoded build reviewable instead of a black box.

## Pattern A: Offline-resilient state (maps, trip tracking, anything with a live in-progress process)
**Architecture** — two separate problems:
1. Static assets offline (map tiles, etc.) → cache-first service worker; the resource URL is the cache key.
2. App state offline → optimistic local write → IndexedDB → background sync → server:
```
action -> IndexedDB (instant) -> try POST -> success: synced | fail/offline: stays "pending" -> flush in order on reconnect
```
**Free-tier defaults:** Vercel (host) + Next.js/TS + Leaflet/OpenStreetMap raster tiles (no key — easiest thing to cache) + the `idb` package + `next-pwa`. This entire pattern can run at zero cost.
**Pitfalls:** trusting `navigator.onLine` alone (unreliable — pair with a manual demo toggle); no idempotency key on queued events (flaky reconnects double-submit); uncapped tile cache growth; skipping an incognito cold-start test before presenting.

## Pattern B: WhatsApp / voice-based booking bot
**Architecture:** WhatsApp Cloud API webhook → send the voice note directly to a Gemini understanding call → mock (or real) booking call → Gemini TTS call → formatted WhatsApp reply (audio + text).
**Setup:** a free Meta developer app + WhatsApp Cloud API test number covers a demo (up to 5 verified test recipients, no business verification needed). Host the webhook as a Next.js API route alongside anything else in the build.

**Zero-cost model choice, and why:**
- Understanding (transcription, language detection, intent extraction) → a Flash-Lite-class Gemini model (e.g. `gemini-3.1-flash-lite`), one call, audio in as inline data, structured JSON out. This is an officially documented use case for that model family and sits inside Google AI Studio's free tier (no credit card, generous per-minute/per-day limits).
- Spoken reply → a **dedicated TTS model** (e.g. `gemini-2.5-flash-tts`), not the audio-to-audio "Live" model. Google's own docs draw this line explicitly: the Live model is for open-ended, real-time, bidirectional conversation over a persistent connection; the TTS model is for exactly what a bot reply needs — structured, one-shot "text in, audio out" — over a plain HTTP call with nothing to keep open. Reaching for the Live model here is a classic mismatch: technically possible to bend into a one-shot tool, architecturally the wrong one.
- **Model names and pricing here move fast — verify the current model string, free-tier limits, and language list against Google's live docs before each new build.** Don't assume last quarter's model name or quota table still holds.

**The free-tier trap:** enabling billing on a Google Cloud project deletes its free tier entirely — every call becomes billable from the first token, even ones that would've fit inside the free quota. Use a dedicated project for any zero-cost build and never attach billing to it. The understanding call's free quota is typically generous and well-documented; a dedicated TTS model's free quota tends to be smaller and not published in a fixed table — check the live limit in AI Studio and always build a text-only fallback for when a TTS call fails or is rate-limited, so a quota hiccup never breaks the demo or costs anything.

**Known ML limitation:** transcription accuracy on lower-resource languages (e.g. Sinhala) is meaningfully weaker than on English for every current speech model, not just one vendor's. Always send the reply's text alongside any generated audio, so a mis-transcription is visible and forgivable rather than a silent wrong booking.

**Pitch honesty:** always state plainly what's mocked vs. real (the booking/dispatch call is almost always mocked in a demo). The pitch is "this pipeline works, here's what real integration takes" — not a claim of production readiness. State the running cost honestly (often genuinely $0 at demo volume) without promising it stays free at any scale. Keep the implementation operator-agnostic so it's pitchable to more than one buyer.

## Packaging-for-resale checklist (both patterns)
- [ ] One glanceable UI/reply element that proves the concept without reading code (a sync-status badge; a formatted WhatsApp confirmation).
- [ ] A manual demo toggle or fallback path for anything that can fail live (offline/reconnect state; a TTS quota miss) — don't let a live demo hard-fail in front of someone.
- [ ] Docs sized to the audience: a technical README for a developer, a one-page pitch note for a business contact — not the same document for both.
- [ ] A deliberately chosen LICENSE (MIT for portfolio/reputation; "proprietary, contact for licensing" if the plan is to sell copies).
- [ ] A cold-start test — fresh incognito window / fresh WhatsApp test number — before presenting to anyone else.
