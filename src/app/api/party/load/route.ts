import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { requireAuthenticatedRequest } from "@/app/lib/auth/require-auth";

export async function POST(req: Request) {
  try {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    const body = await req.json();
    const { partyId } = body as { partyId?: string };

    if (!partyId) {
      return NextResponse.json({ error: "partyId ist erforderlich" }, { status: 400 });
    }

    const party = await partyRegistry.activateParty(partyId);
    const state = party.getState();
    const meta = await partyRegistry.getPartyMetadata(partyId);

    return NextResponse.json({
      success: true,
      party: {
        partyId: state.id,
        name: meta?.name ?? state.id,
        isActive: state.isActive,
        settings: meta?.settings ?? null,
        queue: state.queue,
        currentTrack: state.currentTrack ?? null,
      },
    });
  } catch (err) {
    console.error("Fehler beim Laden der Party:", err);
    if (err instanceof Error && err.message.includes("nicht gefunden")) {
      return NextResponse.json({ error: "Party nicht gefunden" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Fehler beim Laden der Party" },
      { status: 500 }
    );
  }
}
