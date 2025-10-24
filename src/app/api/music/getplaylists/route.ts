import { NextResponse } from "next/server";
import { getProvider } from "@/app/lib/providers/factory";


export async function GET() {
  try {
    const provider = getProvider("spotify"); // später dynamisch
    const playlists = await provider.getPlaylists();
    console.log("Fetched playlists:", playlists);
    return NextResponse.json(playlists);
  } catch (error: any) {
    console.error("Error fetching playlists:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch playlists" },
      { status: 500 }
    );
  }
}
