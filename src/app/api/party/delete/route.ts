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

    await partyRegistry.removeParty(partyId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Löschen der Party:", err);
    return NextResponse.json(
      { error: "Fehler beim Löschen der Party" },
      { status: 500 }
    );
  }
}
