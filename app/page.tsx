"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { TripEvent, TripMapHandle } from "@/components/TripMap";
import TripConsole, { LogLine } from "@/components/TripConsole";
import { PICKUP, DROPOFF } from "@/lib/tripData";

const TripMap = dynamic(() => import("@/components/TripMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
      }}
    >
      loading map…
    </div>
  ),
});

type TripPhase = "idle" | "requested" | "running" | "arrived";

function nowTs() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Home() {
  const mapRef = useRef<TripMapHandle>(null);
  const [phase, setPhase] = useState<TripPhase>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);

  const pushLog = useCallback(
    (tag: LogLine["tag"], text: string) => {
      setLogs((prev) => [...prev.slice(-199), { id: makeId(), ts: nowTs(), tag, text }]);
    },
    []
  );

  const postEvent = useCallback(async (type: string, payload: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/trip-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: "demo-trip-1",
          type,
          payload,
          clientTs: new Date().toISOString(),
        }),
      });
      return res.status;
    } catch {
      return null;
    }
  }, []);

  const handleEvent = useCallback(
    (e: TripEvent) => {
      switch (e.type) {
        case "trip.requested": {
          setPhase("requested");
          pushLog(
            "req",
            `trip.requested   pickup="${PICKUP.label}" dropoff="${DROPOFF.label}"`
          );
          break;
        }
        case "trip.started": {
          setPhase("running");
          pushLog("evt", "trip.started");
          postEvent("trip.started", {}).then((status) => {
            pushLog("req", `→ POST /api/trip-events   ${status ?? "no response"}`);
          });
          break;
        }
        case "trip.location.update": {
          pushLog(
            "evt",
            `trip.location.update  ${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}   ${e.pct}%`
          );
          postEvent("trip.location.update", {
            lat: e.lat,
            lng: e.lng,
            pct: e.pct,
          });
          break;
        }
        case "trip.arrived": {
          setPhase("arrived");
          pushLog("evt", "trip.arrived");
          postEvent("trip.arrived", {}).then((status) => {
            pushLog("req", `→ POST /api/trip-events   ${status ?? "no response"}`);
          });
          break;
        }
      }
    },
    [postEvent, pushLog]
  );

  const handleStart = () => {
    mapRef.current?.start();
  };

  const handleReset = () => {
    mapRef.current?.reset();
    setPhase("requested");
    setLogs([]);
    pushLog(
      "req",
      `trip.requested   pickup="${PICKUP.label}" dropoff="${DROPOFF.label}"`
    );
  };

  const isRunning = phase === "running";
  const isArrived = phase === "arrived";

  return (
    <div className="shell">
      <header className="topbar">
        <div className="wordmark">
          <span className="dot" />
          driftline
        </div>
        <div className="tagline">trip tracking that survives the drop</div>
      </header>

      <main className="main">
        <div className="map-pane">
          <TripMap ref={mapRef} onEvent={handleEvent} />
        </div>

        <div className="side-pane">
          <div className="control-card">
            <h2>Mock trip</h2>

            <div className="leg">
              <span className="marker pickup" />
              <div>
                <span className="label">Pickup</span>
                <span className="value">{PICKUP.label}</span>
              </div>
            </div>

            <div className="leg">
              <span className="marker dropoff" />
              <div>
                <span className="label">Drop-off</span>
                <span className="value">{DROPOFF.label}</span>
              </div>
            </div>

            {!isArrived ? (
              <button className="primary" onClick={handleStart} disabled={isRunning}>
                {isRunning ? "Trip in progress…" : "Start trip"}
              </button>
            ) : (
              <button className="ghost" onClick={handleReset}>
                New trip
              </button>
            )}

            <div className="status-row">
              <span className={`status-dot ${phase !== "idle" ? "active" : ""}`} />
              requested
              <span style={{ opacity: 0.3 }}>—</span>
              <span className={`status-dot ${isRunning || isArrived ? "active" : ""}`} />
              en route
              <span style={{ opacity: 0.3 }}>—</span>
              <span className={`status-dot ${isArrived ? "done" : ""}`} />
              arrived
            </div>
          </div>

          <TripConsole lines={logs} live={isRunning} />
        </div>
      </main>
    </div>
  );
}
