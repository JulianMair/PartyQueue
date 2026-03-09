import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { partyId, index } = body as { partyId?: string; index?: number };

    if (!partyId || typeof index !== "number") {
      return NextResponse.json(
        { error: "partyId und index sind erforderlich" },
        { status: 400 }
      );
    }

    const party = await partyRegistry.getParty(partyId);
    if (!party) {
      return NextResponse.json(
        { error: `Keine Party mit ID ${partyId} gefunden` },
        { status: 404 }
      );
    }

    party.removeTrackAt(index);

    return NextResponse.json({
      success: true,
      queue: party.getState().queue,
    });
  } catch (err) {
    console.error("Fehler beim Löschen des Songs:", err);
    return NextResponse.json(
      { error: "Fehler beim Löschen des Songs" },
      { status: 500 }
    );
  }
}
