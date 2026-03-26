import { NextResponse } from "next/server";
import { SpotifyProvider } from "../../../lib/providers/spotify/index";
import { getProvider } from "../../../lib/providers/factory";
import { requireAuthenticatedRequest } from "@/app/lib/auth/require-auth";

export async function GET() {
  try {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    const provider = getProvider("spotify");
    const user = await provider.getMe();
    return NextResponse.json(user);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
