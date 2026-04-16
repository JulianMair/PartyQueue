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
    const { partyId } = body as { partyId?: string };

    if (!partyId) {
      return NextResponse.json({ error: "partyId ist erforderlich" }, { status: 400 });
    }

    // Verify ownership
    const meta = await partyRegistry.getPartyMetadata(partyId);
    if (meta && meta.ownerId && meta.ownerId !== ownerId) {
      return NextResponse.json({ error: "Keine Berechtigung für diese Party" }, { status: 403 });
    }

    await partyRegistry.removeParty(partyId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Löschen der Party:", err);
    return NextResponse.json(
      { error: "Fehler beim Löschen der Party" },
      { status: 500 }
    );
  }
}
