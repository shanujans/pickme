// Driftline service worker — Phase 2.
//
// Two caches, two strategies, on purpose (see SKILL.md / PROGRESS.md):
//   1. Map tiles  -> cache-first, capped size (osm tile requests are the
//      thing that has to survive a dropped connection).
//   2. App shell / static assets -> stale-while-revalidate, so a reload
//      while offline still renders something instead of a browser error
//      page, but online users always get the freshest build in the
//      background.
// Anything else (e.g. /api/trip-events) is left alone — real offline
// *write* handling for trip events is Phase 3's job (IndexedDB queue),
// not this service worker's.

const SHELL_CACHE = "driftline-shell-v1";
const TILE_CACHE = "driftline-tiles-v1";
const MAX_TILE_ENTRIES = 800; // pitfall from the skill: uncapped tile cache growth

const TILE_HOST = "a.tile.openstreetmap.org";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/", "/manifest.json"]))
      .catch(() => {
        // Best effort — don't fail install if the app shell precache
        // can't complete (e.g. this SW file was updated offline).
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n !== SHELL_CACHE && n !== TILE_CACHE)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const overflow = keys.length - maxEntries;
  if (overflow > 0) {
    // Cache.keys() returns insertion order in every current
    // implementation, so this is a cheap FIFO eviction — good enough
    // for a demo, not a real LRU.
    await Promise.all(keys.slice(0, overflow).map((k) => cache.delete(k)));
  }
}

async function cacheFirstTile(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.status === 200) {
    await cache.put(request, response.clone());
    // Trim after adding so a burst of new tiles doesn't get evicted
    // before it's even served once.
    trimCache(TILE_CACHE, MAX_TILE_ENTRIES);
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  return cached || (await network) || new Response(
    "Offline and this page hasn't been cached yet.",
    { status: 503, statusText: "Offline" }
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (url.hostname === TILE_HOST) {
    event.respondWith(cacheFirstTile(request));
    return;
  }

  const isNavigation = request.mode === "navigate";
  const isShellAsset =
    url.origin === self.location.origin &&
    (isNavigation ||
      url.pathname.startsWith("/_next/static/") ||
      url.pathname === "/manifest.json" ||
      url.pathname.startsWith("/icons/"));

  if (isShellAsset) {
    event.respondWith(staleWhileRevalidate(request));
  }

  // Everything else (API routes, cross-origin non-tile requests) is left
  // to the network, untouched.
});
