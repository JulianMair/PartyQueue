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
  // Story E1: nur das Label nach außen geben, keine internen Drift-Werte —
  // der Gast sieht "wird energischer", nicht die Zahlen dahinter.
  const trend = party.getPartyTrend();

  return NextResponse.json({
    partyId: state.id,
    version: state.version,
    isActive: state.isActive,
    currentTrack: state.currentTrack ?? null,
    queue: (state.queue ?? []).slice(0, 10),
    trend: trend ? { label: trend.label } : null,
    // Timestamps für robuste Progress-Interpolation auf dem Client:
    // Client kann so ausrechnen wie alt der gemeldete progressMs-Wert ist
    // und bei stall-gewordenem Server-Sync nicht zurückspringen.
    serverTime: Date.now(),
  });
}
