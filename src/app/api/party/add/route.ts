import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import type { Track } from "@/app/lib/providers/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { partyId, track } = body as { partyId: string; track: Track };

    if (!partyId || !track) {
      return NextResponse.json(
        { error: "partyId und track sind erforderlich" },
        { status: 400 }
      );
    }

    const party = partyRegistry.getParty(partyId);
    if (!party) {
      return NextResponse.json(
        { error: `Keine Party mit ID ${partyId} gefunden` },
        { status: 404 }
      );
    }

    // Track hinzufügen
    await party.addTrack(track);

    const state = party.getState();
    return NextResponse.json({
      success: true,
      queue: state.queue,
    });
  } catch (err) {
    console.error("Fehler beim Hinzufügen des Songs:", err);
    return NextResponse.json(
      { error: "Fehler beim Hinzufügen des Songs" },
      { status: 500 }
    );
  }
}
