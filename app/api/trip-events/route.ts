import { NextRequest, NextResponse } from "next/server";

// Phase 3: the client (lib/eventQueue.ts) now sends an `id` alongside the
// original {tripId, type, payload, clientTs} contract — a client-generated
// idempotency key, one per queued event. A flaky reconnect can leave the
// client unsure whether an event actually landed before the connection
// dropped, so it retries the same id rather than risk losing the event.
// `seen` turns that retry into a harmless duplicate instead of a second
// write.
//
// In-memory only, so it resets on cold start and isn't shared across
// serverless instances — fine for this demo's single dev/preview process,
// not a substitute for a real datastore if this ever handles real trips.
const seen = new Map<string, { serverTs: string }>();

type TripEventBody = {
  id?: string;
  tripId?: string;
  type?: string;
  payload?: Record<string, unknown>;
  clientTs?: string;
};

export async function POST(req: NextRequest) {
  let body: TripEventBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  if (!body.type) {
    return NextResponse.json(
      { ok: false, error: "missing_type" },
      { status: 400 }
    );
  }

  if (body.id && seen.has(body.id)) {
    const prior = seen.get(body.id)!;
    // eslint-disable-next-line no-console
    console.log("[trip-events] duplicate, already processed:", body.id);
    return NextResponse.json(
      { ok: true, duplicate: true, received: body, serverTs: prior.serverTs },
      { status: 202 }
    );
  }

  const serverTs = new Date().toISOString();
  if (body.id) seen.set(body.id, { serverTs });

  // eslint-disable-next-line no-console
  console.log("[trip-events]", JSON.stringify(body));

  return NextResponse.json(
    {
      ok: true,
      received: body,
      serverTs,
    },
    { status: 202 }
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    note: "POST a trip event here. Idempotent on `id` since Phase 3 — a repeated id is a no-op duplicate, not a re-write.",
  });
}
