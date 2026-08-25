import { NextRequest, NextResponse } from "next/server";

// Phase 1 stub: accept a trip event, validate its shape, log it, and
// echo it back with a server timestamp. There is no persistence yet —
// Phase 3 adds the IndexedDB queue + sync semantics that make this
// endpoint meaningful for offline/reconnect flows. Keeping the contract
// stable now (tripId, type, payload, clientTs) means Phase 3 can start
// queuing against this same route without a breaking change.

type TripEventBody = {
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

  // eslint-disable-next-line no-console
  console.log("[trip-events]", JSON.stringify(body));

  return NextResponse.json(
    {
      ok: true,
      received: body,
      serverTs: new Date().toISOString(),
    },
    { status: 202 }
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    note: "POST a trip event here. Stub only — no persistence until Phase 3.",
  });
}
