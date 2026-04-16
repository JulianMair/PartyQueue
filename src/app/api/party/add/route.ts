import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import type { Track } from "@/app/lib/providers/types";
import { requireAuthenticatedRequest, getCurrentSpotifyUserId } from "@/app/lib/auth/require-auth";

export async function POST(req: Request) {
  try {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    const ownerId = await getCurrentSpotifyUserId();
    if (!ownerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { partyId, track, insertIndex } = body as {
      partyId: string;
      track: Track;
      insertIndex?: number;
    };

    if (!partyId || !track) {
      return NextResponse.json(
        { error: "partyId und track sind erforderlich" },
        { status: 400 }
      );
    }

    const meta = await partyRegistry.getPartyMetadata(partyId);
    if (meta && meta.ownerId && meta.ownerId !== ownerId) {
      return NextResponse.json({ error: "Keine Berechtigung für diese Party" }, { status: 403 });
    }

    const party = await partyRegistry.getParty(partyId);
    if (!party) {
      return NextResponse.json(
        { error: `Keine Party mit ID ${partyId} gefunden` },
        { status: 404 }
      );
    }

    // Track hinzufügen
    await party.addTrack(
      track,
      typeof insertIndex === "number" ? insertIndex : undefined
    );

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
