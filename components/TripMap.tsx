"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
  useState,
} from "react";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import { PICKUP, DROPOFF, ROUTE_PATH, routeCenter } from "@/lib/tripData";

export type TripEvent =
  | { type: "trip.requested" }
  | { type: "trip.started" }
  | { type: "trip.location.update"; lat: number; lng: number; pct: number }
  | { type: "trip.arrived" };

export type TripMapHandle = {
  start: () => void;
  reset: () => void;
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

const TripMap = forwardRef<TripMapHandle, { onEvent: (e: TripEvent) => void }>(
  function TripMap({ onEvent }, ref) {
    const [vehiclePos, setVehiclePos] = useState(ROUTE_PATH[0]);
    const [drawnPath, setDrawnPath] = useState([ROUTE_PATH[0]]);
    const stepRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    useEffect(() => {
      onEventRef.current({ type: "trip.requested" });
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, []);

    const clearTimer = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    useImperativeHandle(ref, () => ({
      start() {
        clearTimer();
        stepRef.current = 0;
        setDrawnPath([ROUTE_PATH[0]]);
        setVehiclePos(ROUTE_PATH[0]);
        onEventRef.current({ type: "trip.started" });

        intervalRef.current = setInterval(() => {
          stepRef.current += 1;
          const i = stepRef.current;

          if (i >= ROUTE_PATH.length) {
            clearTimer();
            setVehiclePos(ROUTE_PATH[ROUTE_PATH.length - 1]);
            setDrawnPath(ROUTE_PATH);
            onEventRef.current({ type: "trip.arrived" });
            return;
          }

          const point = ROUTE_PATH[i];
          setVehiclePos(point);
          setDrawnPath(ROUTE_PATH.slice(0, i + 1));

          // Sample roughly every ~5th tick so the console reads like
          // real telemetry, not a firehose.
          if (i % 5 === 0 || i === ROUTE_PATH.length - 1) {
            onEventRef.current({
              type: "trip.location.update",
              lat: point.lat,
              lng: point.lng,
              pct: Math.round((i / (ROUTE_PATH.length - 1)) * 100),
            });
          }
        }, TICK_MS);
      },
      reset() {
        clearTimer();
        stepRef.current = 0;
        setVehiclePos(ROUTE_PATH[0]);
        setDrawnPath([ROUTE_PATH[0]]);
      },
    }));

    const center = routeCenter();

    return (
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={15}
        scrollWheelZoom={true}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* faint full route, ghosted behind the animated draw-in */}
        <Polyline
          positions={ROUTE_PATH.map((p) => [p.lat, p.lng])}
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
);

export default TripMap;
