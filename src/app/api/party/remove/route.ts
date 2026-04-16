import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
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
    const { partyId, index, trackId } = body as {
      partyId?: string;
      index?: number;
      trackId?: string;
    };

    if (!partyId || (typeof trackId !== "string" && typeof index !== "number")) {
      return NextResponse.json(
        { error: "partyId und trackId oder index sind erforderlich" },
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

    let removed = false;
    if (typeof trackId === "string" && trackId.trim().length > 0) {
      removed = party.removeTrackById(trackId.trim());
    }

    if (!removed && typeof index === "number") {
      const beforeLength = party.getState().queue.length;
      party.removeTrackAt(index);
      removed = party.getState().queue.length < beforeLength;
    }

    if (!removed) {
      return NextResponse.json(
        { error: "Song konnte nicht gelöscht werden" },
        { status: 404 }
      );
    }

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
