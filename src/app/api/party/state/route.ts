import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

export async function GET(req: Request) {
  try {
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
      return NextResponse.json(
        { error: `Keine aktive Party mit ID ${partyId} gefunden` },
        { status: 404 }
      );
    }

    // State vom PartyManager holen
    const state = party.getState();

    return NextResponse.json({
      partyId: state.id,
      isActive: state.isActive,
      currentTrack: state.currentTrack ?? null,
      queue: state.queue ?? [],
    });
  } catch (err) {
    console.error("Fehler beim Abrufen des Party-Status:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler beim Abrufen des Party-Status" },
      { status: 500 }
    );
  }
}
