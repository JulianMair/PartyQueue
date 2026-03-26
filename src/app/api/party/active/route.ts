import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { requireAuthenticatedRequest } from "@/app/lib/auth/require-auth";

export async function GET() {
  const unauthorized = await requireAuthenticatedRequest();
  if (unauthorized) return unauthorized;

  const active = await partyRegistry.getActiveParty();

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
