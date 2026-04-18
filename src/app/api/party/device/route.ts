import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/app/lib/auth/require-auth";
import { setActiveDeviceId } from "@/app/lib/providers/spotify/player";

export async function POST(req: Request) {
  const unauthorized = await requireAuthenticatedRequest();
  if (unauthorized) return unauthorized;

  const { deviceId } = await req.json().catch(() => ({})) as { deviceId?: string };
  if (typeof deviceId === "string" && deviceId.length > 0) {
    setActiveDeviceId(deviceId);
    console.log(`[Device] Aktive SDK-Device-ID gesetzt: ${deviceId}`);
  } else {
    setActiveDeviceId(null);
  }

  return NextResponse.json({ ok: true });
}
