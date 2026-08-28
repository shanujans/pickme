# Driftline — trip tracking that survives a dropped connection

## The problem

Ride-hailing and delivery apps assume a stable connection. Along coastal
roads, rural stretches, and anywhere signal is patchy, that assumption
breaks: the live map freezes, trip events stop reaching the server, and
both driver and passenger lose confidence in what's actually happening —
even when the trip itself is proceeding normally.

## What this demo proves

Driftline is a working prototype — not a mockup or a slide deck — of a
trip-tracking experience that keeps functioning through a dropped
connection:

- **The map stays usable offline.** Once an area has been opened (or
  explicitly downloaded ahead of time), its tiles are cached on the
  device, so the map doesn't go blank the moment signal drops.
- **Trip events are never lost.** Every pickup, location update, and
  arrival is recorded instantly on the device first, then synced to the
  server. If the connection drops mid-trip, events queue locally and
  flush through to the server in the exact order they happened the
  moment the connection returns — no gaps, no out-of-order data.
- **The state is visible at a glance.** A status indicator shows in real
  time whether events are synced, pending, or queued offline, so a rider,
  driver, or dispatcher never has to guess whether tracking is still
  working.

This has been built and tested against real conditions along a Sri
Lankan coastal route, including live network drops and reconnects — not
just simulated in code.

## What's real, what's a demo

The interface, offline caching, and sync-queue logic are fully
functional and have been verified through live testing, including
several rounds of bugs found and fixed by clicking through the running
app rather than just reading the code. The trip-dispatch backend it
talks to is a stand-in built for this demo — a real deployment would
point the same client-side logic at an existing operator's actual
dispatch and trip systems. That integration work, not the offline
mechanism itself, is what a real engagement would scope and price.

## What I'm proposing

Not a pitch to buy an idea — the idea alone isn't worth much, and
that's not the offer. The offer is the thing already built and running:
I'll integrate this offline-resilience layer into an existing app, or
build an equivalent from scratch, for a fixed fee — with ongoing
maintenance available on top. The prototype in this repo is the
evidence that the approach works, not a pitch deck asking you to take it
on faith.

The same approach applies to any ride-hailing, delivery, or field-service
platform operating in areas with unreliable connectivity — it isn't
tied to one operator or one region.

## Try it

A live, interactive version of this demo is available on request —
including the option to watch it survive a real network drop, live, on
the call.
