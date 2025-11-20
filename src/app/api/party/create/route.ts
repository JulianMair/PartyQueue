// src/app/api/party/start/route.ts
import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

export async function POST() {
  const partyId = crypto.randomUUID();

  // aktuell nur Spotify
  const manager = partyRegistry.createParty(partyId, "spotify");

  await manager.startParty();

  return NextResponse.json({ partyId });
}
