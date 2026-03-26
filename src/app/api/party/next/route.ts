
import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { requireAuthenticatedRequest } from "@/app/lib/auth/require-auth";

export async function POST(req: Request) {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    const body = await req.json();
    const { partyId, applyFade } = body as {
      partyId: string;
      applyFade?: boolean;
    };

    if (!partyId) {
      return NextResponse.json(
        { error: "partyId ist erforderlich" },
        { status: 400 }
      );
    }

    const party = await partyRegistry.getParty(partyId);
    if (!party) {
      return NextResponse.json(
        { error: `Keine Party mit ID ${partyId} gefunden` },
        { status: 404 }
      );
    }

    // Track hinzufügen
    await party.playNextTrack(applyFade ?? true);
    return NextResponse.json({ success: true });
}
