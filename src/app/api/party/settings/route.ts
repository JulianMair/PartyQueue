import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { sanitizePartySettings } from "@/app/lib/party/settings";
import { requireAuthenticatedRequest } from "@/app/lib/auth/require-auth";

export async function POST(req: Request) {
  try {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    const body = await req.json().catch(() => ({}));
    const partyId = typeof body?.partyId === "string" ? body.partyId : "";
    const settings = sanitizePartySettings(body?.settings);

    if (!partyId) {
      return NextResponse.json({ error: "partyId ist erforderlich" }, { status: 400 });
    }

    const result = await partyRegistry.updatePartySettings(partyId, settings);
    return NextResponse.json({
      success: true,
      party: result.metadata,
      queue: result.queue,
      addedCount: result.addedCount,
    });
  } catch (err) {
    console.error("Fehler beim Speichern der Party-Settings:", err);
    if (err instanceof Error && err.message.includes("nicht gefunden")) {
      return NextResponse.json({ error: "Party nicht gefunden" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Fehler beim Speichern der Party-Settings" },
      { status: 500 }
    );
  }
}
