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

    const party = await partyRegistry.activateParty(partyId, ownerId);
    const state = party.getState();

    return NextResponse.json({
      success: true,
      party: {
        partyId: state.id,
        name: meta?.name ?? state.id,
        isActive: state.isActive,
        settings: meta?.settings ?? null,
        queue: state.queue,
        currentTrack: state.currentTrack ?? null,
      },
    });
  } catch (err) {
    console.error("Fehler beim Laden der Party:", err);
    if (err instanceof Error && err.message.includes("nicht gefunden")) {
      return NextResponse.json({ error: "Party nicht gefunden" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Fehler beim Laden der Party" },
      { status: 500 }
    );
  }
}
