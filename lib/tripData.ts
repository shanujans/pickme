export type LatLng = { lat: number; lng: number };

// Negombo, Sri Lanka — pickup at Negombo Beach Park, drop-off at the
// clock tower. Coordinates verified against Google Places (previously
// hand-guessed "illustrative coordinates" — the guessed PICKUP was
// ~2.2km off and landed in the lagoon; see PROGRESS.md).
export const PICKUP: LatLng & { label: string } = {
  lat: 7.2377502,
  lng: 79.8401459,
  label: "Negombo Beach Park",
};

export const DROPOFF: LatLng & { label: string } = {
  lat: 7.2091944,
  lng: 79.839905,
  label: "Negombo Clock Tower",
};

// --- Fallback route (no network, no routing engine) -------------------
// A gentle curve between PICKUP and DROPOFF so it reads as "a road"
// rather than "a ruler" — used only if the live routing call below
// fails or is unreachable, not the route shown in normal operation.
// Generated FROM whatever PICKUP/DROPOFF currently are (rather than
// hardcoded absolute waypoints) on purpose: hardcoded waypoints go
// stale — and silently wrong — the moment either endpoint is corrected,
// which is exactly how the previous version ended up bowing out over
// the lagoon. This still isn't real road geometry and can still, in
// principle, clip a land/water boundary — it's explicitly a rough
// approximation, not a second routing engine.
function generateFallbackWaypoints(a: LatLng, b: LatLng, segments = 4): LatLng[] {
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  const len = Math.sqrt(dLat * dLat + dLng * dLng) || 1e-9;
  // Perpendicular unit vector to the straight line a→b.
  const perpLat = -dLng / len;
  const perpLng = dLat / len;
  const bend = len * 0.12; // gentle bend, 12% of the straight-line distance

  const points: LatLng[] = [a];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const taper = Math.sin(Math.PI * t); // 0 at both ends, peaks at the midpoint
    points.push({
      lat: a.lat + dLat * t + perpLat * bend * taper,
      lng: a.lng + dLng * t + perpLng * bend * taper,
    });
  }
  points.push(b);
  return points;
}

const FALLBACK_WAYPOINTS: LatLng[] = generateFallbackWaypoints(PICKUP, DROPOFF);

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Catmull-Rom spline through the waypoints, discretized into `steps`
// points per segment, so the marker glides along a smooth curve rather
// than snapping corner to corner.
function catmullRom(points: LatLng[], stepsPerSegment: number): LatLng[] {
  const pad = [points[0], ...points, points[points.length - 1]];
  const result: LatLng[] = [];

  for (let i = 1; i < pad.length - 2; i++) {
    const p0 = pad[i - 1];
    const p1 = pad[i];
    const p2 = pad[i + 1];
    const p3 = pad[i + 2];

    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;

      const lat =
        0.5 *
        (2 * p1.lat +
          (-p0.lat + p2.lat) * t +
          (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
          (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3);

      const lng =
        0.5 *
        (2 * p1.lng +
          (-p0.lng + p2.lng) * t +
          (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2 +
          (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3);

      result.push({ lat, lng });
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

export const FALLBACK_ROUTE_PATH: LatLng[] = catmullRom(FALLBACK_WAYPOINTS, 10);

// --- Live route (real roads, via OSRM's free public demo server) ------
// No API key needed. This is OSRM's shared public demo instance — fine
// for a prototype/pitch at low volume, explicitly NOT meant for
// production traffic per OSRM's own usage policy
// (https://operations.osmfoundation.org/policies/routing/). A
// self-hosted or paid OSRM/Mapbox/Google instance is the real-
// integration path if this ever needs to run at real scale. Always
// falls back to FALLBACK_ROUTE_PATH above rather than failing the demo.
const OSRM_URL =
  `https://router.project-osrm.org/route/v1/driving/` +
  `${PICKUP.lng},${PICKUP.lat};${DROPOFF.lng},${DROPOFF.lat}` +
  `?overview=full&geometries=geojson`;

export async function fetchLiveRoute(): Promise<LatLng[] | null> {
  try {
    const res = await fetch(OSRM_URL);
    if (!res.ok) return null;
    const data = await res.json();
    // OSRM's own contract: a non-"Ok" `code` (NoRoute, NoSegment, etc.)
    // can still come back with HTTP 200, so check both.
    if (data?.code !== "Ok") return null;
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    // GeoJSON coordinates are [lng, lat] — flip to this app's {lat, lng}.
    return coords.map(([lng, lat]: [number, number]) => ({ lat, lng }));
  } catch {
    return null; // offline, CORS hiccup, demo server rate-limited, etc.
  }
}

export function routeCenter(path: LatLng[]): LatLng {
  return path[Math.floor(path.length / 2)];
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeLengthMeters(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += distanceMeters(path[i - 1], path[i]);
  }
  return total;
}

// unused helper kept small on purpose — lerp is here for future phases
// (e.g. interpolating between queued offline points on reconnect).
export const _lerp = lerp;
