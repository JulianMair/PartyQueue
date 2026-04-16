import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { partyId, track, clientId } = body as {
      partyId?: string;
      track?: any;
      clientId?: string;
    };

    if (!partyId || !track || !clientId || !track.id) {
      return NextResponse.json({ error: "partyId, track und clientId sind erforderlich" }, { status: 400 });
    }

    const party = await partyRegistry.getParty(partyId);
    if (!party) {
      return NextResponse.json({ error: "Party nicht gefunden" }, { status: 404 });
    }

    // Check if suggestions are enabled
    const meta = await partyRegistry.getPartyMetadata(partyId);
    if (meta && !meta.settings.suggestionsEnabled) {
      return NextResponse.json({ error: "Vorschläge sind deaktiviert" }, { status: 403 });
    }

    const result = party.suggest(track, clientId);

    return NextResponse.json({
      status: result.status,
      suggestion: result.suggestion ?? null,
      suggestions: party.getSuggestions(),
      threshold: party.getSuggestionThreshold(),
    });
  } catch (err) {
    console.error("[suggest] Error:", err);
    return NextResponse.json({ error: "Fehler beim Vorschlagen" }, { status: 500 });
  }
}
