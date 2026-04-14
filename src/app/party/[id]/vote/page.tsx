"use client";

import { useEffect, useRef, useState, use } from "react";
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

function markVoted(partyId: string, trackId: string) {
  localStorage.setItem(`vote_${partyId}_${trackId}`, "1");
}

function unmarkVoted(partyId: string, trackId: string) {
  localStorage.removeItem(`vote_${partyId}_${trackId}`);
}

function loadVotedSet(partyId: string, tracks: PartyTrack[]) {
  const voted = new Set<string>();
  for (const track of tracks) {
    if (localStorage.getItem(`vote_${partyId}_${track.id}`) === "1") {
      voted.add(track.id);
    }
  }
  return voted;
}

function getTop10Signature(top10: PartyTrack[]) {
  return top10
    .map((track) => `${track.id}:${track.votes}:${track.addedAt}`)
    .join("|");
}

function trackShouldComeBefore(a: PartyTrack, b: PartyTrack) {
  return a.votes > b.votes || (a.votes === b.votes && a.addedAt < b.addedAt);
}

function applyLocalVoteDelta(
  previous: PartyTrack[],
  trackId: string,
  delta: 1 | -1
) {
  const index = previous.findIndex((song) => song.id === trackId);
  if (index < 0) return previous;

  const next = previous.map((song, i) =>
    i === index ? { ...song, votes: Math.max(0, song.votes + delta) } : song
  );

  let current = index;

  if (delta > 0) {
    while (
      current > 0 &&
      trackShouldComeBefore(next[current], next[current - 1])
    ) {
      const tmp = next[current - 1];
      next[current - 1] = next[current];
      next[current] = tmp;
      current -= 1;
    }
  } else {
    while (
      current < next.length - 1 &&
      trackShouldComeBefore(next[current + 1], next[current])
    ) {
      const tmp = next[current + 1];
      next[current + 1] = next[current];
      next[current] = tmp;
      current += 1;
    }
  }

  return next;
}

/* -------------------------------------------------------------------------- */
/*                               PAGE COMPONENT                                */
/* -------------------------------------------------------------------------- */

export default function MobileVotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: partyId } = use(params);

  const [songs, setSongs] = useState<PartyTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<PartyTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [votedTrackIds, setVotedTrackIds] = useState<Set<string>>(new Set());
  const [pendingVoteTrackIds, setPendingVoteTrackIds] = useState<Set<string>>(new Set());
  const inFlightRef = useRef(false);
  const top10SignatureRef = useRef("");
  const versionRef = useRef(0);

  const buildSpotifyLink = (track: PartyTrack) => {
    if (track.id) {
      return `https://open.spotify.com/track/${encodeURIComponent(track.id)}`;
    }
    if (track.uri && track.uri.startsWith("spotify:track:")) {
      const trackId = track.uri.split(":")[2];
      if (trackId) {
        return `https://open.spotify.com/track/${encodeURIComponent(trackId)}`;
      }
    }
    return null;
  };

  /* -------------------------------------------------------------------------- */
  /*                            LOAD TOP 10 SONGS                               */
  /* -------------------------------------------------------------------------- */

  const load = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetch(`/api/party/mobile?partyId=${partyId}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Fehler beim Laden");
        return;
      }

      setError(null);
      const top10 = Array.isArray(data.top10) ? (data.top10 as PartyTrack[]) : [];
      const nextSignature = getTop10Signature(top10);
      if (nextSignature !== top10SignatureRef.current) {
        top10SignatureRef.current = nextSignature;
        setSongs(top10);
        setVotedTrackIds(loadVotedSet(partyId, top10));
      }

      if (data.currentTrack) {
        setCurrentTrack(data.currentTrack as PartyTrack);
      } else {
        setCurrentTrack(null);
      }

      if (typeof data.version === "number") {
        versionRef.current = data.version;
      }
    } catch (e) {
      console.error("[Mobile] Fehler beim Laden:", e);
      setError("Netzwerkfehler");
    } finally {
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    let isCancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (isCancelled) return;
      await load();

      if (isCancelled) return;
      const nextDelay = document.hidden ? 3500 : 1500;
      timer = setTimeout(run, nextDelay);
    };

    void run();

    const onVisibilityChange = () => {
      if (isCancelled) return;
      if (!document.hidden) {
        void load();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [partyId]);

  /* -------------------------------------------------------------------------- */
  /*                                   VOTING                                   */
  /* -------------------------------------------------------------------------- */

  const vote = async (trackId: string) => {
    if (pendingVoteTrackIds.has(trackId)) return;

    const clientId = getClientId();
    const previousSongs = songs;
    const wasVoted = votedTrackIds.has(trackId);
    const action: "vote" | "unvote" = wasVoted ? "unvote" : "vote";

    setPendingVoteTrackIds((prev) => {
      const next = new Set(prev);
      next.add(trackId);
      return next;
    });

    const optimistic = applyLocalVoteDelta(previousSongs, trackId, wasVoted ? -1 : 1);
    setSongs(optimistic);
    top10SignatureRef.current = getTop10Signature(optimistic);
    setVotedTrackIds((prev) => {
      const next = new Set(prev);
      if (wasVoted) next.delete(trackId);
      else next.add(trackId);
      return next;
    });

    try {
      const res = await fetch("/api/party/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, trackId, clientId, action }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status === "not_found") {
        setSongs(previousSongs);
        top10SignatureRef.current = getTop10Signature(previousSongs);
        setVotedTrackIds((prev) => {
          const next = new Set(prev);
          if (wasVoted) next.add(trackId);
          else next.delete(trackId);
          return next;
        });
        return;
      }

      if (data.status === "ok" || data.status === "duplicate") {
        markVoted(partyId, trackId);
        setVotedTrackIds((prev) => {
          const next = new Set(prev);
          next.add(trackId);
          return next;
        });
      }

      if (data.status === "removed" || data.status === "not_voted") {
        unmarkVoted(partyId, trackId);
        setVotedTrackIds((prev) => {
          const next = new Set(prev);
          next.delete(trackId);
          return next;
        });
      }

      if (Array.isArray(data.top10)) {
        const serverTop10 = data.top10 as PartyTrack[];
        const nextSignature = getTop10Signature(serverTop10);
        if (nextSignature !== top10SignatureRef.current) {
          top10SignatureRef.current = nextSignature;
          setSongs(serverTop10);
        }
      }

      if (typeof data.version === "number") {
        versionRef.current = data.version;
      }
    } catch {
      setSongs(previousSongs);
      top10SignatureRef.current = getTop10Signature(previousSongs);
      setVotedTrackIds((prev) => {
        const next = new Set(prev);
        if (wasVoted) next.add(trackId);
        else next.delete(trackId);
        return next;
      });
    } finally {
      setPendingVoteTrackIds((prev) => {
        const next = new Set(prev);
        next.delete(trackId);
        return next;
      });
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                                   UI                                       */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-black text-white flex flex-col max-w-md mx-auto">
      <div className="flex-1 px-4 py-6 overflow-y-auto pb-24">
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
        <div className="space-y-3">
          {songs.map((s, i) => {
            const voted = votedTrackIds.has(s.id);
            const pending = pendingVoteTrackIds.has(s.id);
            const spotifyLink = buildSpotifyLink(s);

            return (
              <div
                key={`${s.id}-${s.addedAt}`}
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

                {/* Spotify Link */}
                {spotifyLink ? (
                  <a
                    href={spotifyLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 rounded-lg text-xs border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 transition"
                    title="In Spotify öffnen"
                    aria-label="In Spotify öffnen"
                  >
                    Spotify
                  </a>
                ) : (
                  <span
                    className="px-2 py-1 rounded-lg text-xs border border-neutral-700 text-neutral-600"
                    title="Kein Spotify-Link verfügbar"
                  >
                    N/A
                  </span>
                )}

                {/* Vote Button */}
                <button
                  disabled={pending}
                  onClick={() => vote(s.id)}
                  className={`px-3 py-1 rounded-lg text-sm ${
                    pending
                      ? "bg-neutral-700 text-neutral-500 cursor-wait"
                      : voted
                      ? "bg-yellow-700 hover:bg-yellow-600 text-yellow-100"
                      : "bg-green-600 hover:bg-green-500 text-white"
                  }`}
                >
                  {pending ? "…" : voted ? "↩︎" : "👍"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Now Playing Footer */}
      {currentTrack && (
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 px-4 py-3 max-w-md mx-auto">
          <div className="flex items-center gap-3">
            {currentTrack.albumArt ? (
              <img
                src={currentTrack.albumArt}
                alt={currentTrack.name}
                className="w-11 h-11 rounded-md object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-11 h-11 bg-neutral-700 rounded-md flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {currentTrack.name}
              </p>
              <p className="text-xs text-neutral-400 truncate">
                {currentTrack.artist}
              </p>
            </div>
            <span className="text-xs text-green-500 font-medium flex-shrink-0">
              Spielt
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
