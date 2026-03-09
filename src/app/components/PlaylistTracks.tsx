"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Track, Playlist } from "../lib/providers/types";
import { useParty } from "@/app/context/PartyContext";

interface PlaylistTracksProps {
  playlist: Playlist | null;
  partyId?: string; // 🔹 optional: Party-ID, falls schon aktiv
}

export default function PlaylistTracks({ playlist }: PlaylistTracksProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const [addingTrack, setAddingTrack] = useState<string | null>(null); // 🔹 für Ladezustand beim Hinzufügen
  const [addingPlaylist, setAddingPlaylist] = useState(false);
  const [playlistAddMessage, setPlaylistAddMessage] = useState<string | null>(null);
  const { partyId, isPartyActive } = useParty();

  // --- EXISTIERENDE useCallback fetchTracks() ---
  const fetchTracks = useCallback(async () => {
    if (!playlist?.id || loading || !hasMore) return;
    setLoading(true);

    try {
      const res = await fetch(
        `/api/music/playlists/${playlist.id}/tracks?offset=${offset}&limit=50`
      );
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      setTracks((prev) => [...prev, ...data.tracks]);
      setOffset((prev) => prev + 50);
      setHasMore(Boolean(data.next));
    } catch (err) {
      console.error("Fehler beim Laden der Songs:", err);
    } finally {
      setLoading(false);
    }
  }, [playlist?.id, offset, hasMore, loading]);

  // --- EXISTIERENDE useEffects bleiben gleich ---
  useEffect(() => {
    if (!playlist) return;
    setTracks([]);
    setOffset(0);
    setHasMore(true);
  }, [playlist]);

  useEffect(() => {
    if (playlist) fetchTracks();
  }, [playlist, fetchTracks]);

  const lastTrackRef = useCallback(
    (node: HTMLLIElement | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchTracks();
        }
      });

      if (node) observer.current.observe(node);
    },
    [loading, hasMore, fetchTracks]
  );

  const playTrack = async (track: Track) => {
    try {
      await fetch("/api/music/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: track.uri }),
      });
      console.log(`▶️ "${track.name}" wird jetzt abgespielt.`);
    } catch (err) {
      console.error("Fehler beim Abspielen:", err);
    }
  };

  // 🔹 NEU: Track zur Party hinzufügen
  const addTrackToParty = async (track: Track) => {
    if (!partyId) {
      alert("Keine aktive Party gefunden!");
      return;
    }

    setAddingTrack(track.id);
    try {
      const res = await fetch("/api/party/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, track }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Hinzufügen");
      console.log(`🎉 "${track.name}" wurde zur Party-Queue hinzugefügt!`);
    } catch (err) {
      console.error(err);
      alert("Fehler beim Hinzufügen des Songs zur Party-Queue!");
    } finally {
      setAddingTrack(null);
    }
  };

  const addPlaylistToParty = async () => {
    if (!playlist?.id) return;
    if (!partyId) {
      alert("Keine aktive Party gefunden!");
      return;
    }

    setAddingPlaylist(true);
    setPlaylistAddMessage(null);

    try {
      const res = await fetch("/api/party/add-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, playlistId: playlist.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Hinzufügen der Playlist");

      setPlaylistAddMessage(`${data.addedCount ?? 0} Songs zur Party hinzugefügt`);
    } catch (err) {
      console.error(err);
      setPlaylistAddMessage("Fehler beim Hinzufügen der Playlist");
    } finally {
      setAddingPlaylist(false);
    }
  };

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  if (!playlist)
    return (
      <div className="text-gray-500 p-6">
        🎵 Wähle links eine Playlist aus, um Songs zu sehen.
      </div>
    );

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-neutral-900 pr-2">
      <div className="sticky top-0 z-10 pb-3 mb-3 border-b border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-400 truncate">{playlist.name}</p>
          <button
            onClick={addPlaylistToParty}
            disabled={!isPartyActive || addingPlaylist}
            className={`px-3 py-1 text-sm rounded-md transition ${
              !isPartyActive || addingPlaylist
                ? "bg-green-800 text-gray-300 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            {addingPlaylist ? "⏳ Playlist wird hinzugefügt..." : "➕ Ganze Playlist zur Party"}
          </button>
        </div>
        {playlistAddMessage && (
          <p className="text-xs text-gray-400 mt-2">{playlistAddMessage}</p>
        )}
      </div>

      <ul className="space-y-2">
        {tracks.map((track, i) => (
          <li
            key={track.id}
            ref={i === tracks.length - 1 ? lastTrackRef : null}
            className="flex items-center gap-4 bg-neutral-900 border border-neutral-800 rounded-lg p-3 hover:bg-neutral-800 transition"
          >
            <p className="w-6 text-gray-500">{i + 1}</p>
            {track.albumArt && (
              <img
                src={track.albumArt}
                alt={track.name}
                className="w-10 h-10 rounded-md object-cover"
              />
            )}
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onDoubleClick={() => playTrack(track)}
            >
              <p className="text-gray-100 truncate">{track.name}</p>
              <p className="text-gray-400 text-sm truncate">{track.artist}</p>
            </div>
            <p className="text-gray-500 text-sm w-14 text-right">
              {typeof track.durationMs === "number"
                ? formatDuration(track.durationMs)
                : "--:--"}
            </p>

            {/* 🔹 NEUER Button: Song zur Party hinzufügen */}
            <button
              onClick={() => addTrackToParty(track)}
              disabled={addingTrack === track.id}
              className={`ml-3 px-3 py-1 text-sm rounded-md transition ${
                addingTrack === track.id
                  ? "bg-green-700 text-gray-300 cursor-wait"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              {addingTrack === track.id ? "✔ Hinzufügen..." : "➕ Zur Party"}
            </button>
          </li>
        ))}
      </ul>

      {loading && (
        <p className="text-center text-gray-400 py-4 animate-pulse">
          ⏳ Lade weitere Songs...
        </p>
      )}
      <div className="text-center text-gray-500 py-4"></div>
    </div>
  );
}
