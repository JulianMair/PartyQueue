// app/api/party/create/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parties, Party } from "../data";
import { v4 as uuid } from "uuid";

export async function POST() {
  const cookieStore = await cookies();
  const hostId = cookieStore.get("spotify_access_token")?.value; // besser Spotify-ID aus /me
  if (!hostId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const partyId = uuid();
  const newParty: Party = {
    id: partyId,
    hostId,
    guests: [],
    votes: {},
  };
  parties.set(partyId, newParty);

  return NextResponse.json({ partyId });
}
