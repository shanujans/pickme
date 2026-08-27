"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TripEvent, TripMapHandle } from "@/components/TripMap";
import TripConsole, { LogLine } from "@/components/TripConsole";
import { PICKUP, DROPOFF } from "@/lib/tripData";
import { downloadTilesForOffline, DownloadProgress } from "@/lib/offlineTiles";
import {
  enqueueEvent,
  getSnapshot,
  initReconnectFlush,
  setSimulateOffline,
  subscribeToQueue,
  QueueSnapshot,
} from "@/lib/eventQueue";

const TRIP_ID = "demo-trip-1";

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

type DownloadState = "idle" | "downloading" | "done" | "error";

export default function Home() {
  const mapRef = useRef<TripMapHandle>(null);
  const [phase, setPhase] = useState<TripPhase>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [tileIssue, setTileIssue] = useState(false);
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    done: 0,
    total: 0,
    failed: 0,
  });
  const [queueSnapshot, setQueueSnapshot] = useState<QueueSnapshot>({
    pending: 0,
    synced: 0,
  });
  const [offlineSim, setOfflineSim] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("Service worker registration failed:", err);
      });
    }
  }, []);

  const pushLog = useCallback(
    (tag: LogLine["tag"], text: string) => {
      setLogs((prev) => [...prev.slice(-199), { id: makeId(), ts: nowTs(), tag, text }]);
    },
    []
  );

  // Phase 3: every trip event is an optimistic write into IndexedDB first
  // (see lib/eventQueue.ts), never a direct POST — that's what lets the
  // demo keep recording a trip through a dropped connection. `event` on
  // the callback fires only when *that* specific record flips to synced,
  // so the console can show individual events landing rather than just a
  // running total.
  useEffect(() => {
    getSnapshot().then(setQueueSnapshot);
    const unsubQueue = subscribeToQueue((snapshot, event) => {
      setQueueSnapshot(snapshot);
      if (event?.status === "synced") {
        pushLog("sync", `→ synced   ${event.type}  #${event.id.slice(0, 8)}`);
      }
    });
    const unsubOnline = initReconnectFlush();
    return () => {
      unsubQueue();
      unsubOnline();
    };
  }, [pushLog]);

  const queueEvent = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      enqueueEvent(TRIP_ID, type, payload).then((queued) => {
        pushLog(
          "req",
          `→ queued   ${queued.type}  #${queued.id.slice(0, 8)}${
            offlineSim ? "  (offline — will flush on reconnect)" : ""
          }`
        );
      });
    },
    [pushLog, offlineSim]
  );

  const handleToggleOffline = () => {
    const next = !offlineSim;
    setOfflineSim(next);
    setSimulateOffline(next);
    pushLog(
      "sync",
      next
        ? "sim.offline ON — new events will queue locally"
        : "sim.offline OFF — flushing queued events in order"
    );
  };

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
          queueEvent("trip.started", {});
          break;
        }
        case "trip.location.update": {
          pushLog(
            "evt",
            `trip.location.update  ${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}   ${e.pct}%`
          );
          queueEvent("trip.location.update", {
            lat: e.lat,
            lng: e.lng,
            pct: e.pct,
          });
          break;
        }
        case "trip.arrived": {
          setPhase("arrived");
          pushLog("evt", "trip.arrived");
          queueEvent("trip.arrived", {});
          break;
        }
        case "route.ready": {
          pushLog(
            "sync",
            e.live
              ? `route.ready   live road route via OSRM (${e.points} pts)`
              : `route.ready   fallback curve (${e.points} pts) — live routing unavailable`
          );
          break;
        }
      }
    },
    [queueEvent, pushLog]
  );

  const handleStart = () => {
    mapRef.current?.start();
  };

  const handleDownloadArea = async () => {
    const map = mapRef.current;
    if (!map) {
      pushLog("err", "download.error   map component ref not attached — try again in a moment");
      return;
    }

    let viewport;
    try {
      viewport = map.getViewport();
    } catch (err) {
      pushLog(
        "err",
        `download.error   getViewport() threw: ${err instanceof Error ? err.message : String(err)}`
      );
      return;
    }

    if (!viewport) {
      pushLog(
        "err",
        "download.error   map viewport not ready (Leaflet instance not initialized yet) — try again in a moment"
      );
      return;
    }

    const z = Math.round(viewport.zoom);
    const zoomLevels = [z - 1, z, z + 1].filter((zl) => zl >= 1 && zl <= 19);

    pushLog(
      "req",
      `download.start   zoom ${zoomLevels.join("/")}   bounds [${viewport.bounds.south.toFixed(4)},${viewport.bounds.west.toFixed(4)}]→[${viewport.bounds.north.toFixed(4)},${viewport.bounds.east.toFixed(4)}]`
    );

    setDownloadState("downloading");
    setDownloadProgress({ done: 0, total: 0, failed: 0 });

    try {
      const result = await downloadTilesForOffline(
        viewport.bounds,
        zoomLevels,
        setDownloadProgress
      );
      setDownloadState(result.failed > 0 && result.done === result.failed ? "error" : "done");
      pushLog(
        "evt",
        `download.done   ${result.done - result.failed}/${result.total} tiles cached${
          result.failed > 0 ? `, ${result.failed} failed` : ""
        }`
      );
    } catch (err) {
      setDownloadState("error");
      pushLog(
        "err",
        `download.error   ${err instanceof Error ? err.message : String(err)}`
      );
    }
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
          <TripMap forwardedRef={mapRef} onEvent={handleEvent} onTileError={() => setTileIssue(true)} />
          {tileIssue && (
            <div className="tile-banner">
              Some map tiles here aren&apos;t cached for offline use. Reconnect,
              then use &ldquo;Download this area&rdquo; below.
            </div>
          )}
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

          <div className="control-card">
            <h2>Offline area</h2>
            <button
              className="ghost"
              style={{ marginTop: 0 }}
              onClick={handleDownloadArea}
              disabled={downloadState === "downloading"}
            >
              {downloadState === "downloading"
                ? "Downloading…"
                : "Download this area for offline use"}
            </button>

            {downloadState === "downloading" && (
              <>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${
                        downloadProgress.total
                          ? Math.round((downloadProgress.done / downloadProgress.total) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="download-status">
                  {downloadProgress.done} / {downloadProgress.total} tiles
                </div>
              </>
            )}

            {downloadState === "done" && (
              <div className="download-status">
                {downloadProgress.total - downloadProgress.failed} tiles cached across 3 zoom
                levels{downloadProgress.failed > 0 ? ` (${downloadProgress.failed} failed)` : ""}.
              </div>
            )}

            {downloadState === "error" && (
              <div className="download-status" style={{ color: "var(--danger)" }}>
                Couldn&apos;t download tiles — check your connection and try again.
              </div>
            )}
          </div>

          <div className="control-card">
            <h2>Sync queue</h2>
            <div className="queue-counts">
              <span className={queueSnapshot.pending > 0 ? "pending active" : "pending"}>
                {queueSnapshot.pending} pending
              </span>
              <span className="divider">·</span>
              <span className="synced">{queueSnapshot.synced} synced</span>
            </div>
            <button className="ghost" onClick={handleToggleOffline}>
              {offlineSim ? "Go back online" : "Simulate offline"}
            </button>
            <div className="download-status">
              {offlineSim
                ? "Offline simulated — trip events queue locally and flush in order once you reconnect."
                : "navigator.onLine can lag reality, so this toggle drives the demo instead of relying on it alone."}
            </div>
          </div>

          <TripConsole lines={logs} live={isRunning} />
        </div>
      </main>
    </div>
  );
}
