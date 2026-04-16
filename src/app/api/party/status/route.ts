// app/api/party/status/route.ts
import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { requireAuthenticatedRequest, getCurrentSpotifyUserId } from "@/app/lib/auth/require-auth";

export async function GET(req: Request) {
  try {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    const ownerId = await getCurrentSpotifyUserId();
    if (!ownerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const partyId = searchParams.get("partyId");

    if (!partyId) {
      return NextResponse.json({ error: "partyId ist erforderlich" }, { status: 400 });
    }

    const meta = await partyRegistry.getPartyMetadata(partyId);
    if (meta && meta.ownerId && meta.ownerId !== ownerId) {
      return NextResponse.json({ error: "Keine Berechtigung für diese Party" }, { status: 403 });
    }

    const party = await partyRegistry.getParty(partyId);
    if (!party) {
      return NextResponse.json({ error: "Party not found" }, { status: 404 });
    }

    const state = party.getState();
    const partyMeta = meta ?? await partyRegistry.getPartyMetadata(partyId);

    return NextResponse.json({
      party: {
        partyId: state.id,
        name: partyMeta?.name ?? state.id,
        isActive: state.isActive,
        settings: partyMeta?.settings ?? null,
        currentTrack: state.currentTrack ?? null,
        queue: state.queue,
      },
    });
  } catch (err) {
    console.error("Party status error:", err);
    return NextResponse.json({ error: "Failed to fetch party status" }, { status: 500 });
  }
}
