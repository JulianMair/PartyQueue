import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { requireAuthenticatedRequest, getCurrentSpotifyUserId } from "@/app/lib/auth/require-auth";

// Bestätigt oder verwirft einen wartenden Auto-Fill-Vorschlag (Story D4,
// Vorschlagsmodus). Nur der Gastgeber darf das — genau wie bei den
// bestehenden Queue-Aktionen (remove, reorder).
export async function POST(req: Request) {
  try {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    const ownerId = await getCurrentSpotifyUserId();
    if (!ownerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { partyId, trackId, action } = body as {
      partyId?: string;
      trackId?: string;
      action?: "confirm" | "reject";
    };

    if (!partyId || !trackId || (action !== "confirm" && action !== "reject")) {
      return NextResponse.json(
        { error: "partyId, trackId und action ('confirm' | 'reject') sind erforderlich" },
        { status: 400 }
      );
    }

    const meta = await partyRegistry.getPartyMetadata(partyId);
    if (meta && meta.ownerId && meta.ownerId !== ownerId) {
      return NextResponse.json({ error: "Keine Berechtigung für diese Party" }, { status: 403 });
    }

    const applied =
      action === "confirm"
        ? await partyRegistry.confirmRecommendation(partyId, trackId)
        : await partyRegistry.rejectRecommendation(partyId, trackId);

    if (!applied) {
      return NextResponse.json(
        { error: "Vorschlag nicht gefunden" },
        { status: 404 }
      );
    }

    const party = await partyRegistry.getParty(partyId);
    const state = party?.getState();

    return NextResponse.json({
      success: true,
      queue: state?.queue ?? [],
      pendingRecommendations: state?.pendingRecommendations ?? [],
    });
  } catch (err) {
    console.error("Fehler beim Bearbeiten des Vorschlags:", err);
    return NextResponse.json(
      { error: "Fehler beim Bearbeiten des Vorschlags" },
      { status: 500 }
    );
  }
}
