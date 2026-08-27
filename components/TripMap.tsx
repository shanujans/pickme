"use client";

import {
  useImperativeHandle,
  useRef,
  useEffect,
  useState,
  type Ref,
} from "react";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import { PICKUP, DROPOFF, FALLBACK_ROUTE_PATH, fetchLiveRoute, routeCenter } from "@/lib/tripData";
import type { LatLng } from "@/lib/tripData";

export type TripEvent =
  | { type: "trip.requested" }
  | { type: "trip.started" }
  | { type: "trip.location.update"; lat: number; lng: number; pct: number }
  | { type: "trip.arrived" }
  | { type: "route.ready"; live: boolean; points: number };

export type Viewport = {
  bounds: { north: number; south: number; east: number; west: number };
  zoom: number;
};

export type TripMapHandle = {
  start: () => void;
  reset: () => void;
  getViewport: () => Viewport | null;
};

const TICK_MS = 140;

function pinIcon(color: string, label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
        width:16px;height:16px;border-radius:50% 50% 50% 0;
        background:${color};
        border:2px solid rgba(11,18,32,0.9);
        transform:rotate(-45deg);
        box-shadow:0 0 0 2px rgba(0,0,0,0.15);
      "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 16],
    tooltipAnchor: [8, -6],
  });
}

function vehicleIcon() {
  return L.divIcon({
    className: "dl-vehicle-icon",
    html: `<div style="
        width:22px;height:22px;border-radius:50%;
        background:#0b1220;
        border:2px solid #37d6c4;
        display:flex;align-items:center;justify-content:center;
        font-size:12px;
      ">🛺</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// NOT wrapped in forwardRef, and forwardedRef is a plain prop, not the
// special `ref` prop — deliberately. next/dynamic (page.tsx wraps this
// component with ssr:false) does not reliably forward the special `ref`
// prop through to the loaded component, even when that component uses
// forwardRef correctly — a long-documented Next.js limitation (see
// vercel/next.js#4957). Regular props pass through next/dynamic just
// fine, and useImperativeHandle doesn't care how its ref argument
// arrived — a ref object handed down as an ordinary prop works exactly
// the same as one received via forwardRef's second argument. This is
// the actual fix, not a style preference: with the old forwardRef
// version, mapRef.current in page.tsx was always null in production,
// silently breaking "Start trip" and "Download this area" both.
export default function TripMap({
  onEvent,
  onTileError,
  forwardedRef,
}: {
  onEvent: (e: TripEvent) => void;
  onTileError?: () => void;
  forwardedRef?: Ref<TripMapHandle>;
}) {
    const [routePath, setRoutePath] = useState<LatLng[]>(FALLBACK_ROUTE_PATH);
    const [vehiclePos, setVehiclePos] = useState(routePath[0]);
    const [drawnPath, setDrawnPath] = useState([routePath[0]]);
    const stepRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;
    const onTileErrorRef = useRef(onTileError);
    onTileErrorRef.current = onTileError;
    const mapInstanceRef = useRef<L.Map | null>(null);
    const hasRequestedRef = useRef(false);
    const startedRef = useRef(false);

    useEffect(() => {
      // Guarded against React Strict Mode's dev-only mount -> cleanup ->
      // remount cycle, which would otherwise log trip.requested twice in
      // `next dev` (refs survive that cycle; state doesn't reset it).
      if (!hasRequestedRef.current) {
        hasRequestedRef.current = true;
        onEventRef.current({ type: "trip.requested" });
      }
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, []);

    // Try to replace the illustrative fallback curve with a real,
    // road-snapped route. Only swapped in if the trip hasn't started yet
    // — never yank the path out from under an animation already running.
    useEffect(() => {
      let cancelled = false;
      fetchLiveRoute().then((live) => {
        if (cancelled || startedRef.current) return;
        if (live && live.length > 1) {
          setRoutePath(live);
          setVehiclePos(live[0]);
          setDrawnPath([live[0]]);
          onEventRef.current({ type: "route.ready", live: true, points: live.length });
        } else {
          onEventRef.current({
            type: "route.ready",
            live: false,
            points: FALLBACK_ROUTE_PATH.length,
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }, []);

    const clearTimer = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    useImperativeHandle(forwardedRef, () => ({
      start() {
        clearTimer();
        startedRef.current = true;
        stepRef.current = 0;
        setDrawnPath([routePath[0]]);
        setVehiclePos(routePath[0]);
        onEventRef.current({ type: "trip.started" });

        intervalRef.current = setInterval(() => {
          stepRef.current += 1;
          const i = stepRef.current;

          if (i >= routePath.length) {
            clearTimer();
            setVehiclePos(routePath[routePath.length - 1]);
            setDrawnPath(routePath);
            onEventRef.current({ type: "trip.arrived" });
            return;
          }

          const point = routePath[i];
          setVehiclePos(point);
          setDrawnPath(routePath.slice(0, i + 1));

          // Sample roughly every ~5th tick so the console reads like
          // real telemetry, not a firehose.
          if (i % 5 === 0 || i === routePath.length - 1) {
            onEventRef.current({
              type: "trip.location.update",
              lat: point.lat,
              lng: point.lng,
              pct: Math.round((i / (routePath.length - 1)) * 100),
            });
          }
        }, TICK_MS);
      },
      reset() {
        clearTimer();
        startedRef.current = false;
        stepRef.current = 0;
        setVehiclePos(routePath[0]);
        setDrawnPath([routePath[0]]);
      },
      getViewport() {
        const map = mapInstanceRef.current;
        if (!map) return null;
        const b = map.getBounds();
        return {
          bounds: {
            north: b.getNorth(),
            south: b.getSouth(),
            east: b.getEast(),
            west: b.getWest(),
          },
          zoom: map.getZoom(),
        };
      },
    }));

    const center = routeCenter(routePath);

    return (
      <MapContainer
        ref={mapInstanceRef}
        center={[center.lat, center.lng]}
        zoom={15}
        scrollWheelZoom={true}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          // Pinned to a single subdomain (no {s} rotation) on purpose: the
          // "download this area" flow and the service worker's cache-first
          // lookup both key on the exact request URL, so the live map and
          // the pre-fetcher have to agree on one host or a downloaded tile
          // won't be found when Leaflet re-requests it offline.
          url="https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            tileerror: () => onTileErrorRef.current?.(),
          }}
        />

        {/* faint full route, ghosted behind the animated draw-in */}
        <Polyline
          positions={routePath.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: "#24304a", weight: 4, opacity: 0.7 }}
        />
        <Polyline
          positions={drawnPath.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: "#37d6c4", weight: 4, opacity: 0.95 }}
        />

        <Marker position={[PICKUP.lat, PICKUP.lng]} icon={pinIcon("#f2b84b", PICKUP.label)}>
          <Tooltip permanent direction="top" className="dl-pin-label" offset={[0, -4]}>
            {PICKUP.label}
          </Tooltip>
        </Marker>

        <Marker position={[DROPOFF.lat, DROPOFF.lng]} icon={pinIcon("#37d6c4", DROPOFF.label)}>
          <Tooltip permanent direction="top" className="dl-pin-label" offset={[0, -4]}>
            {DROPOFF.label}
          </Tooltip>
        </Marker>

        <Marker position={[vehiclePos.lat, vehiclePos.lng]} icon={vehicleIcon()} />
      </MapContainer>
    );
}
