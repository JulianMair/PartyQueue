// app/api/party/status/route.ts
import { NextResponse } from "next/server";
import { parties } from "../data";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const partyId = searchParams.get("partyId");

  const party = partyId ? parties.get(partyId) : null;
  if (!party) return NextResponse.json({ error: "Party not found" }, { status: 404 });

  return NextResponse.json({ party });
}
