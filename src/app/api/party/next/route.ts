
import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

export async function POST(req: Request) {
    const body = await req.json();
    const { partyId } = body as { partyId: string};

    if (!partyId) {
      return NextResponse.json(
        { error: "partyId ist erforderlich" },
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

    // Track hinzufügen
    await party.playNextTrack();
    return NextResponse.json({ success: true });
}
