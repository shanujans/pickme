"use client";

export type LogLine = {
  id: string;
  ts: string;
  tag: "req" | "evt" | "err" | "sync";
  text: string;
};

export default function TripConsole({
  lines,
  live,
}: {
  lines: LogLine[];
  live: boolean;
}) {
  return (
    <div className="console">
      <h2>Event console</h2>
      <div className="console-log">
        {lines.length === 0 && (
          <div className="empty">waiting for trip.requested…</div>
        )}
        {lines.map((l) => (
          <div className="log-line" key={l.id}>
            <span className="ts">{l.ts}</span>
            <span className={`tag ${l.tag}`}>{l.text}</span>
          </div>
        ))}
        {live && <span className="cursor" />}
      </div>
    </div>
  );
}
