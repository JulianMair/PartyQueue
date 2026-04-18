
import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { requireAuthenticatedRequest, getCurrentSpotifyUserId } from "@/app/lib/auth/require-auth";

export async function POST(req: Request) {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    const ownerId = await getCurrentSpotifyUserId();
    if (!ownerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Ungültiger JSON-Body" },
        { status: 400 }
      );
    }

    const { partyId, applyFade } = (body ?? {}) as {
      partyId?: string;
      applyFade?: boolean;
    };

    if (!partyId) {
      return NextResponse.json(
        { error: "partyId ist erforderlich" },
        { status: 400 }
      );
    }

    try {
      const meta = await partyRegistry.getPartyMetadata(partyId);
      if (meta && meta.ownerId && meta.ownerId !== ownerId) {
        return NextResponse.json({ error: "Keine Berechtigung für diese Party" }, { status: 403 });
      }

      const party = await partyRegistry.getParty(partyId);
      if (!party) {
        return NextResponse.json(
          { error: `Keine Party mit ID ${partyId} gefunden` },
          { status: 404 }
        );
      }

      await party.playNextTrack(applyFade ?? true);
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error("[next] Error:", err);
      return NextResponse.json(
        { error: "Fehler beim Weiterschalten" },
        { status: 500 }
      );
    }
}
