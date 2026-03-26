import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { requireAuthenticatedRequest } from "@/app/lib/auth/require-auth";

export async function GET() {
  try {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    const parties = await partyRegistry.listParties();
    return NextResponse.json({ parties });
  } catch (err) {
    console.error("Fehler beim Laden der Partyliste:", err);
    return NextResponse.json(
      { error: "Fehler beim Laden der Partyliste" },
      { status: 500 }
    );
  }
}
