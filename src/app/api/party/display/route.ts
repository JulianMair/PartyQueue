import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let partyId = searchParams.get("partyId");

  // Ohne partyId: automatisch die aktive Party verwenden
  if (!partyId) {
    const active = await partyRegistry.getActiveParty();
    if (!active) {
      return NextResponse.json(
        { error: "Keine aktive Party vorhanden", partyId: null },
        { status: 404 }
      );
    }
    partyId = active.partyId;
  }

  const party = await partyRegistry.getParty(partyId);

  if (!party) {
    return NextResponse.json(
      { error: `Party mit ID ${partyId} nicht gefunden` },
      { status: 404 }
    );
  }

  const state = party.getState();

  return NextResponse.json({
    partyId: state.id,
    version: state.version,
    isActive: state.isActive,
    currentTrack: state.currentTrack ?? null,
    queue: (state.queue ?? []).slice(0, 10),
  });
}
