import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { partyId, playlistId } = body as {
      partyId: string;
      playlistId: string;
    };

    if (!partyId || !playlistId) {
      return NextResponse.json(
        { error: "partyId und playlistId sind erforderlich" },
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

    const addedCount = await party.addPlaylist(playlistId);
    const state = party.getState();

    return NextResponse.json({
      success: true,
      addedCount,
      queue: state.queue,
    });
  } catch (err) {
    console.error("Fehler beim Hinzufügen der Playlist:", err);
    return NextResponse.json(
      { error: "Fehler beim Hinzufügen der Playlist" },
      { status: 500 }
    );
  }
}
