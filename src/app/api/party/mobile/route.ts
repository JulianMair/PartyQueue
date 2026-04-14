import { NextResponse } from "next/server";
import { partyRegistry } from "@/app/lib/party/PartyRegistry";
import { resolvePreviewUrlsForTracks } from "@/app/lib/providers/spotify/preview";
import type { PartyTrack } from "@/app/lib/providers/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const partyId = searchParams.get("partyId");

  if (!partyId) {
    return NextResponse.json(
      { error: "partyId ist erforderlich" },
      { status: 400 }
    );
  }

  const party = await partyRegistry.getParty(partyId);

  if (!party) {
    console.log("[/api/party/mobile] Keine Party gefunden für ID:", partyId);
    return NextResponse.json(
      { error: `Party mit ID ${partyId} nicht gefunden`, top10: [] },
      { status: 404 }
    );
  }

  const state = party.getState();

  // Nur Top 10 aus deiner PartyQueue
  const top10 = state.queue.slice(0, 10);
  const idsWithoutPreview = top10
    .filter((track) => !track.previewUrl)
    .map((track) => track.id);

  let enrichedTop10: PartyTrack[] = top10;
  if (idsWithoutPreview.length > 0) {
    try {
      const previewById = await resolvePreviewUrlsForTracks(idsWithoutPreview);
      enrichedTop10 = top10.map((track) => ({
        ...track,
        previewUrl:
          track.previewUrl ??
          (Object.prototype.hasOwnProperty.call(previewById, track.id)
            ? previewById[track.id]
            : null),
      }));
    } catch (error) {
      console.error("[/api/party/mobile] Preview enrichment failed:", error);
    }
  }

  return NextResponse.json({
    partyId: state.id,
    version: state.version,
    top10: enrichedTop10,
    currentTrack: state.currentTrack ?? null,
  });
}
