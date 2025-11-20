import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { partyId, trackId, clientId } = await req.json();

  if (!clientId) {
    return NextResponse.json({ error: "clientId missing" }, { status: 400 });
  }

  const manager = partyRegistry.getParty(partyId);
  if (!manager) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }

  await manager.vote(trackId, clientId);

  return NextResponse.json({ success: true });
}
