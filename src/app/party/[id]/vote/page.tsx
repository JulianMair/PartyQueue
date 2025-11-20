"use client";

import { useEffect, useState, use } from "react";
import { PartyTrack } from "@/app/lib/providers/types";

/* -------------------------------------------------------------------------- */
/*                         CLIENT ID HANDLING (SAFE)                           */
/* -------------------------------------------------------------------------- */

function getClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    let id = localStorage.getItem("party_client_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("party_client_id", id);
    }
    return id;
  }

  const fallbackUUID = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });

  let id = localStorage.getItem("party_client_id");
  if (!id) {
    id = fallbackUUID();
    localStorage.setItem("party_client_id", id);
  }
  return id;
}

/* -------------------------------------------------------------------------- */
/*                      FRONTEND LOCAL VOTE TRACKING                           */
/* -------------------------------------------------------------------------- */

function hasVoted(partyId: string, trackId: string): boolean {
  return localStorage.getItem(`vote_${partyId}_${trackId}`) === "1";
}

function markVoted(partyId: string, trackId: string) {
  localStorage.setItem(`vote_${partyId}_${trackId}`, "1");
}

/* -------------------------------------------------------------------------- */
/*                               PAGE COMPONENT                                */
/* -------------------------------------------------------------------------- */

export default function MobileVotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: partyId } = use(params);

  const [songs, setSongs] = useState<PartyTrack[]>([]);
  const [error, setError] = useState<string | null>(null);

  /* -------------------------------------------------------------------------- */
  /*                            LOAD TOP 10 SONGS                               */
  /* -------------------------------------------------------------------------- */

  const load = async () => {
    try {
      const res = await fetch(`/api/party/mobile?partyId=${partyId}`);

      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("API liefert HTML statt JSON:", text);
        setError("Serverfehler: Ungültige Antwort.");
        return;
      }

      if (!res.ok) {
        setError(data.error || "Fehler beim Laden");
        setSongs([]);
        return;
      }

      setError(null);
      setSongs(data.top10 || []);
    } catch (e) {
      console.error("[Mobile] Fehler beim Laden:", e);
      setError("Netzwerkfehler");
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [partyId]);

  /* -------------------------------------------------------------------------- */
  /*                                   VOTING                                   */
  /* -------------------------------------------------------------------------- */

  const vote = async (trackId: string) => {
    if (hasVoted(partyId, trackId)) return;

    const clientId = getClientId();

    await fetch("/api/party/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partyId, trackId, clientId }),
    });

    markVoted(partyId, trackId); // sofort sperren
  };

  /* -------------------------------------------------------------------------- */
  /*                                   UI                                       */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-center mb-6">🎉 Party Voting</h1>

      {error && (
        <p className="text-center text-red-400 text-sm mb-4">{error}</p>
      )}

      {songs.length === 0 && !error && (
        <p className="text-center text-neutral-400 mt-6">
          Keine Songs verfügbar.
        </p>
      )}

      {/* SCROLLABLE SONG LIST */}
      <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
        {songs.map((s, i) => {
          const voted = hasVoted(partyId, s.id);

          return (
            <div
              key={s.id}
              className="flex items-center gap-4 bg-neutral-900 border border-neutral-800 rounded-lg p-3"
            >
              {/* Album Art */}
              {s.albumArt ? (
                <img
                  src={s.albumArt}
                  alt={s.name}
                  className="w-12 h-12 rounded-md object-cover"
                />
              ) : (
                <div className="w-12 h-12 bg-neutral-700 rounded-md" />
              )}

              {/* Song Info */}
              <div className="flex-1 min-w-0">
                <p className="text-gray-100 font-medium truncate">
                  {i + 1}. {s.name}
                </p>
                <p className="text-gray-400 text-sm truncate">{s.artist}</p>
                <p className="text-xs text-neutral-500">Votes: {s.votes}</p>
              </div>

              {/* Vote Button */}
              <button
                disabled={voted}
                onClick={() => vote(s.id)}
                className={`px-3 py-1 rounded-lg text-sm ${
                  voted
                    ? "bg-neutral-700 text-neutral-500 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-500"
                }`}
              >
                {voted ? "✔" : "👍"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
