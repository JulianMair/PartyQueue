import { NextResponse } from "next/server";
import { getProvider } from "@/app/lib/providers/factory";
import { requireAuthenticatedRequest } from "@/app/lib/auth/require-auth";

export async function POST(req: Request) {
  try {
    const unauthorized = await requireAuthenticatedRequest();
    if (unauthorized) return unauthorized;

    // 🔹 Provider dynamisch bestimmen (oder fix „spotify“)
    const provider = getProvider("spotify");

    // 🔹 Den Provider machen lassen
    await provider.next();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Play error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to play track" },
      { status: 500 }
    );
  }
}
