import { NextResponse } from "next/server";
import { SpotifyProvider } from "../../../lib/providers/spotify/index";
import { getProvider } from "../../../lib/providers/factory";

export async function GET() {
  try {
    const provider = getProvider("spotify");
    const user = await provider.getMe();
    return NextResponse.json(user);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}

