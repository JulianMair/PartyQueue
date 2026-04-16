// src/app/api/party/start/route.ts
import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { sanitizePartySettings } from "@/app/lib/party/settings";
import { requireAuthenticatedRequest, getCurrentSpotifyUserId } from "@/app/lib/auth/require-auth";

export async function POST(req: Request) {
  try {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    const ownerId = await getCurrentSpotifyUserId();
    if (!ownerId) {
      return NextResponse.json({ error: "Spotify-User konnte nicht ermittelt werden" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name : undefined;
    const settings = sanitizePartySettings(body?.settings);
    const { partyId, metadata } = await partyRegistry.createParty({
      providerName: "spotify",
      name,
      settings,
      ownerId,
    });

    return NextResponse.json({ partyId, party: metadata });
  } catch (err) {
    console.error("Fehler beim Erstellen der Party:", err);
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Party" },
      { status: 500 }
    );
  }
}
