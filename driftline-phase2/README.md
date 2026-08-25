# Driftline (Track A, Phase 2)

Trip tracking that survives the drop. Phase 2 adds installability (PWA
manifest + icons) and offline map tiles (service worker + a manual
"download this area" button). Phase 3 (the actual offline *trip state*
queue) is next. See `PROGRESS.md` for full history.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Click **Start trip**, and try **Download this
area for offline use** while online.

## Verify Phase 2's "done when" criteria

1. **Installable** — open Chrome DevTools → **Application → Manifest**.
   It should show the Driftline name/icons with no errors. For the full
   Lighthouse check: DevTools → **Lighthouse** → PWA category → Analyze.
2. **Offline reload / offline area** — visit the page once online, click
   **Download this area for offline use** and let it finish, then in
   DevTools → **Network**, set throttling to **Offline** and reload. The
   downloaded area should still render.
3. **Clear failure, not silent** — while still offline, pan the map to an
   area you didn't download. You should see the amber "some map tiles
   aren't cached" banner rather than blank/broken tiles.

## Push to GitHub + deploy to Vercel

Same as Phase 1 — commit and push, Vercel redeploys automatically on push
if it's already connected to this repo:

```bash
git add .
git commit -m "Phase 2: PWA + offline tile caching"
git push
```

Then update `PROGRESS.md` with confirmation the three checks above passed
on the live URL, before starting Phase 3.

## Stack

- Next.js 14 (App Router) + TypeScript
- Leaflet + react-leaflet, OpenStreetMap raster tiles (single subdomain,
  pinned for cache consistency — see `PROGRESS.md`)
- Hand-rolled service worker (`public/sw.js`) — cache-first tiles,
  stale-while-revalidate app shell
- `/api/trip-events` is still a stub — no persistence until Phase 3

