import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

export async function GET() {
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
    queue: state.queue,
  });
}
