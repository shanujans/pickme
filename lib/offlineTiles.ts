// Slippy-map tile math + the "download this area for offline use" flow.
// Writes straight into the same Cache Storage bucket the service worker
// reads from (TILE_CACHE_NAME) — the page and the SW share one origin's
// caches, so no messaging layer is needed for this.

export type BoundsLike = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export const TILE_CACHE_NAME = "driftline-tiles-v1";

// Must match the single hardcoded subdomain used by the live TileLayer
// (see TripMap.tsx) — if the pre-fetch and the live map ever request
// different {s} subdomains for the "same" tile, the cache-first lookup
// in sw.js misses even though the tile was already downloaded.
const TILE_HOST = "a.tile.openstreetmap.org";

function lon2tileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}

function lat2tileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
}

export function tileUrl(z: number, x: number, y: number): string {
  return `https://${TILE_HOST}/${z}/${x}/${y}.png`;
}

export function tilesForBounds(
  bounds: BoundsLike,
  zoomLevels: number[]
): { z: number; x: number; y: number }[] {
  const tiles: { z: number; x: number; y: number }[] = [];

  for (const z of zoomLevels) {
    const xMin = lon2tileX(bounds.west, z);
    const xMax = lon2tileX(bounds.east, z);
    // North (higher latitude) maps to a *smaller* tile-y.
    const yMin = lat2tileY(bounds.north, z);
    const yMax = lat2tileY(bounds.south, z);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y });
      }
    }
  }

  return tiles;
}

export type DownloadProgress = {
  done: number;
  total: number;
  failed: number;
};

const CONCURRENCY = 6; // be polite to the free OSM tile server

export async function downloadTilesForOffline(
  bounds: BoundsLike,
  zoomLevels: number[],
  onProgress: (p: DownloadProgress) => void
): Promise<DownloadProgress> {
  if (typeof window === "undefined" || !("caches" in window)) {
    throw new Error("Cache Storage isn't available in this browser.");
  }

  const tiles = tilesForBounds(bounds, zoomLevels);
  const cache = await caches.open(TILE_CACHE_NAME);

  const total = tiles.length;
  let done = 0;
  let failed = 0;
  onProgress({ done, total, failed });

  let cursor = 0;

  async function worker() {
    while (cursor < tiles.length) {
      const i = cursor++;
      const t = tiles[i];
      const url = tileUrl(t.z, t.x, t.y);

      try {
        const already = await cache.match(url);
        if (!already) {
          const res = await fetch(url);
          if (res.ok) {
            await cache.put(url, res.clone());
          } else {
            failed++;
          }
        }
      } catch {
        failed++;
      }

      done++;
      onProgress({ done, total, failed });
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, Math.max(tiles.length, 1)) },
    () => worker()
  );
  await Promise.all(workers);

  return { done, total, failed };
}
