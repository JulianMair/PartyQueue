import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";

export async function GET() {
  try {
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
