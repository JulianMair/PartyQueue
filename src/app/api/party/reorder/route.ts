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
    const { partyId, fromIndex, toIndex } = body as {
      partyId?: string;
      fromIndex?: number;
      toIndex?: number;
    };

    if (
      !partyId ||
      typeof fromIndex !== "number" ||
      typeof toIndex !== "number"
    ) {
      return NextResponse.json(
        { error: "partyId, fromIndex und toIndex sind erforderlich" },
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

    party.moveTrack(fromIndex, toIndex);

    return NextResponse.json({
      success: true,
      queue: party.getState().queue,
    });
  } catch (err) {
    console.error("Fehler beim Verschieben des Songs:", err);
    return NextResponse.json(
      { error: "Fehler beim Verschieben des Songs" },
      { status: 500 }
    );
  }
}
