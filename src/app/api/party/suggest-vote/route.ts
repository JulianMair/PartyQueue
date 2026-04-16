import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { partyId, trackId, clientId, action } = body as {
      partyId?: string;
      trackId?: string;
      clientId?: string;
      action?: "vote" | "unvote";
    };

    if (!partyId || !trackId || !clientId) {
      return NextResponse.json({ error: "partyId, trackId und clientId sind erforderlich" }, { status: 400 });
    }

    const party = await partyRegistry.getParty(partyId);
    if (!party) {
      return NextResponse.json({ error: "Party nicht gefunden" }, { status: 404 });
    }

    const result = action === "unvote"
      ? party.unvoteSuggestion(trackId, clientId)
      : party.voteSuggestion(trackId, clientId);

    return NextResponse.json({
      status: result.status,
      promoted: "promoted" in result ? result.promoted : false,
      suggestions: party.getSuggestions(),
      threshold: party.getSuggestionThreshold(),
    });
  } catch (err) {
    console.error("[suggest-vote] Error:", err);
    return NextResponse.json({ error: "Fehler beim Abstimmen" }, { status: 500 });
  }
}
