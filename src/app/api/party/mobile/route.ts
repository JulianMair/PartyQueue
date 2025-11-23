import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const partyId = searchParams.get("partyId");

  if (!partyId) {
    return NextResponse.json(
      { error: "partyId ist erforderlich" },
      { status: 400 }
    );
  }

  const party = partyRegistry.getParty(partyId);

  if (!party) {
    console.log("[/api/party/mobile] Keine Party gefunden für ID:", partyId);
    return NextResponse.json(
      { error: `Party mit ID ${partyId} nicht gefunden`, top10: [] },
      { status: 404 }
    );
  }

  const state = party.getState();

  // Nur Top 10 aus deiner PartyQueue
  const top10 = state.queue.slice(0, 10);

  return NextResponse.json({
    partyId: state.id,
    top10,
  });
}
