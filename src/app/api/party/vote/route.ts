import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { partyId, trackId, clientId, action } = await req.json();

  if (!partyId || !trackId || !clientId) {
    return NextResponse.json(
      { error: "partyId, trackId und clientId sind erforderlich" },
      { status: 400 }
    );
  }

  const manager = await partyRegistry.getParty(partyId);
  if (!manager) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }

  const result =
    action === "unvote"
      ? manager.unvote(trackId, clientId)
      : manager.vote(trackId, clientId);

  return NextResponse.json({
    success: result.status !== "not_found",
    status: result.status,
    top10: result.top10,
    version: result.version,
  });
}
