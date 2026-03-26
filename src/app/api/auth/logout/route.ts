import { NextResponse } from "next/server";
import { clearSpotifyAuthCookies } from "@/app/lib/providers/spotify/auth";

export async function POST(req: Request) {
  await clearSpotifyAuthCookies();

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
  return NextResponse.json({
    success: true,
    redirectTo: `${baseUrl}/`,
  });
}
