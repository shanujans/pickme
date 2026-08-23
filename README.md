# Driftline (Track A, Phase 1)

Trip tracking that survives the drop. This is Phase 1 of 4 — a mock trip on
a real Leaflet/OpenStreetMap map, with a stub events API. No offline
behavior yet; that starts in Phase 2. See `PROGRESS.md` for what's done and
what's next.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 — click **Start trip** to watch the tuk-tuk
animate from Negombo Beach Park to the Negombo Clock Tower, with a live
event feed on the right.

## Push to GitHub + deploy to Vercel

This tool (Claude.ai) can't push code or deploy for you. From your local
copy of this project:

```bash
git init
git add .
git commit -m "Phase 1: map foundation"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

Then in Vercel: **New Project → Import** your GitHub repo → it will
auto-detect Next.js → **Deploy**. No environment variables are needed for
Phase 1.

Once deployed, update `PROGRESS.md` with the live URL before starting
Phase 2.

## Stack

- Next.js 14 (App Router) + TypeScript
- Leaflet + react-leaflet, OpenStreetMap raster tiles (no API key)
- No backend/database yet — `/api/trip-events` is a stub that logs and
  returns 202
