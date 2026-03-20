// src/app/api/party/start/route.ts
import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { sanitizePartySettings } from "@/app/lib/party/settings";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name : undefined;
    const settings = sanitizePartySettings(body?.settings);
    const { partyId, metadata } = await partyRegistry.createParty({
      providerName: "spotify",
      name,
      settings,
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
