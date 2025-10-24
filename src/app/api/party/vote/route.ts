// app/api/party/vote/route.ts
import { NextResponse } from "next/server";
import { parties } from "../data";

export async function POST(req: Request) {
  const { partyId, songUri } = await req.json();
  const party = parties.get(partyId);
  if (!party) return NextResponse.json({ error: "Party not found" }, { status: 404 });

  party.votes[songUri] = (party.votes[songUri] || 0) + 1;
  return NextResponse.json({ votes: party.votes });
}
