import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { requireAuthenticatedRequest, getCurrentSpotifyUserId } from "@/app/lib/auth/require-auth";

export async function GET() {
  try {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    const ownerId = await getCurrentSpotifyUserId();
    if (!ownerId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parties = await partyRegistry.listParties(ownerId);
    return NextResponse.json({ parties });
  } catch (err) {
    console.error("Fehler beim Laden der Partyliste:", err);
    return NextResponse.json(
      { error: "Fehler beim Laden der Partyliste" },
      { status: 500 }
    );
  }
}
