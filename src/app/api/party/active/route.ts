import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { requireAuthenticatedRequest, getCurrentSpotifyUserId } from "@/app/lib/auth/require-auth";

export async function GET() {
  const unauthorized = await requireAuthenticatedRequest();
  if (unauthorized) return unauthorized;

  const ownerId = await getCurrentSpotifyUserId();
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const active = await partyRegistry.getActiveParty(ownerId);

  if (!active) {
    return NextResponse.json({ partyId: null, isActive: false, queue: [] });
  }

  const state = active.manager.getState();
  const meta = await partyRegistry.getPartyMetadata(active.partyId);
  return NextResponse.json({
    partyId: state.id,
    name: meta?.name ?? state.id,
    isActive: state.isActive,
    settings: meta?.settings ?? null,
    queue: state.queue,
  });
}
