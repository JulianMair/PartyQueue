import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

// Display v2: liefert ausschließlich die Top-10-Voting-Liste (ohne currentTrack).
// Gedacht für eine reine "Charts"-Ansicht auf dem Beamer, bei der die Songs
// groß und aus der Ferne lesbar dargestellt werden.
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
  const meta = await partyRegistry.getPartyMetadata(partyId);

  return NextResponse.json({
    partyId: state.id,
    name: meta?.name ?? state.id,
    version: state.version,
    isActive: state.isActive,
    queue: (state.queue ?? []).slice(0, 10),
    serverTime: Date.now(),
  });
}
