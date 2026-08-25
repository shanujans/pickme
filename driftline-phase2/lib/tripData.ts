export type LatLng = { lat: number; lng: number };

// Negombo, Sri Lanka — pickup near the beach park, drop-off near the
// clock tower / bus stand. Real place names, illustrative coordinates.
export const PICKUP: LatLng & { label: string } = {
  lat: 7.2201,
  lng: 79.8317,
  label: "Negombo Beach Park",
};

export const DROPOFF: LatLng & { label: string } = {
  lat: 7.2085,
  lng: 79.838,
  label: "Negombo Clock Tower",
};

// Two waypoints pulled slightly off the straight line so the mock route
// reads as "a road" rather than "a ruler." Deterministic, not a real
// routing engine — good enough for a demo, and cheap to swap for a real
// directions API later.
const WAYPOINTS: LatLng[] = [
  { lat: 7.2201, lng: 79.8317 },
  { lat: 7.2168, lng: 79.8302 },
  { lat: 7.2131, lng: 79.8321 },
  { lat: 7.2104, lng: 79.8358 },
  { lat: 7.2085, lng: 79.838 },
];

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

export const ROUTE_PATH: LatLng[] = catmullRom(WAYPOINTS, 10);

export function routeCenter(): LatLng {
  const mid = ROUTE_PATH[Math.floor(ROUTE_PATH.length / 2)];
  return mid;
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

export function routeLengthMeters(): number {
  let total = 0;
  for (let i = 1; i < ROUTE_PATH.length; i++) {
    total += distanceMeters(ROUTE_PATH[i - 1], ROUTE_PATH[i]);
  }
  return total;
}

// unused helper kept small on purpose — lerp is here for future phases
// (e.g. interpolating between queued offline points on reconnect).
export const _lerp = lerp;
