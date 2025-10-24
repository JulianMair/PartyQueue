// app/api/party/join/route.ts
import { NextResponse } from "next/server";
import { parties } from "../data";

export async function POST(req: Request) {
  const { partyId, guestId } = await req.json();

  const party = parties.get(partyId);
  if (!party) return NextResponse.json({ error: "Party not found" }, { status: 404 });

  if (!party.guests.includes(guestId)) {
    party.guests.push(guestId);
  }

  return NextResponse.json({ success: true, guests: party.guests });
}
