"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Track, Playlist } from "../lib/providers/types";
import { useParty } from "@/app/context/PartyContext";

interface PlaylistTracksProps {
  playlist: Playlist | null;
  partyId?: string; // 🔹 optional: Party-ID, falls schon aktiv
}

export default function PlaylistTracks({ playlist }: PlaylistTracksProps) {
  const MIN_SEARCH_CHARS = 2;
  const SEARCH_DEBOUNCE_MS = 350;
  const [tracks, setTracks] = useState<Track[]>([]);
  const [searchTracks, setSearchTracks] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const [addingTrack, setAddingTrack] = useState<string | null>(null); // 🔹 für Ladezustand beim Hinzufügen
  const [addingPlaylist, setAddingPlaylist] = useState(false);
  const [playlistAddMessage, setPlaylistAddMessage] = useState<string | null>(null);
  const { partyId, isPartyActive } = useParty();
  const searchAbortRef = useRef<AbortController | null>(null);
  const latestSearchTokenRef = useRef(0);
  const normalizedSearchQuery = useMemo(() => searchQuery.trim(), [searchQuery]);
  const isSearching = normalizedSearchQuery.length >= MIN_SEARCH_CHARS;
  const displayedTracks = useMemo(
    () => (isSearching ? searchTracks : tracks),
    [isSearching, searchTracks, tracks]
  );

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
    if (playlist && !isSearching) fetchTracks();
  }, [playlist, fetchTracks, isSearching]);

  useEffect(() => {
    if (!isSearching) {
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      setSearchTracks([]);
      setSearchError(null);
      setSearchLoading(false);
      setHasSearched(false);
      return;
    }

    const token = latestSearchTokenRef.current + 1;
    latestSearchTokenRef.current = token;

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true);
        setSearchError(null);
        setHasSearched(true);
        const q = encodeURIComponent(normalizedSearchQuery);
        const res = await fetch(`/api/music/search?q=${q}&limit=50`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (token !== latestSearchTokenRef.current) return;
        if (!res.ok) throw new Error(data.error || "Fehler bei der Suche");
        setSearchTracks(Array.isArray(data.tracks) ? data.tracks : []);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (token !== latestSearchTokenRef.current) return;
        setSearchError(err?.message || "Fehler bei der Suche");
        setSearchTracks([]);
      } finally {
        if (token === latestSearchTokenRef.current) {
          setSearchLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isSearching, normalizedSearchQuery]);

  const lastTrackRef = useCallback(
    (node: HTMLLIElement | null) => {
    if (loading || isSearching) return;
    if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchTracks();
        }
      });

      if (node) observer.current.observe(node);
    },
    [loading, hasMore, fetchTracks, isSearching]
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

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-neutral-900 pr-2">
      <div className="sticky top-0 z-10 pb-3 mb-3 border-b border-neutral-800 bg-neutral-950">
        <div className="flex items-center gap-2 mb-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Spotify Songs suchen..."
            className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-gray-100 placeholder:text-gray-500"
          />
            {searchQuery && (
              <button
              onClick={() => {
                setSearchQuery("");
                setSearchError(null);
              }}
              className="px-3 py-2 text-xs rounded-md bg-neutral-800 text-gray-300 hover:bg-neutral-700"
            >
              Reset
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-400 truncate">
            {isSearching
              ? `Suche: "${normalizedSearchQuery}"`
              : playlist?.name || "Keine Playlist ausgewählt"}
          </p>
          <button
            onClick={addPlaylistToParty}
            disabled={!isPartyActive || addingPlaylist || !playlist || isSearching}
            className={`px-3 py-1 text-sm rounded-md transition ${
              !isPartyActive || addingPlaylist || !playlist || isSearching
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
        {searchError && (
          <p className="text-xs text-red-400 mt-2">{searchError}</p>
        )}
      </div>

      <ul className="space-y-2">
        {displayedTracks.map((track, i) => (
          <li
            key={`${track.id}-${track.uri}`}
            ref={!isSearching && i === displayedTracks.length - 1 ? lastTrackRef : null}
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

      {searchLoading && (
        <p className="text-center text-gray-400 py-4 animate-pulse">
          🔎 Suche läuft...
        </p>
      )}
      {!isSearching && normalizedSearchQuery.length > 0 && normalizedSearchQuery.length < MIN_SEARCH_CHARS && (
        <p className="text-gray-500 p-6 text-center">
          Bitte mindestens {MIN_SEARCH_CHARS} Zeichen eingeben.
        </p>
      )}
      {loading && !isSearching && (
        <p className="text-center text-gray-400 py-4 animate-pulse">
          ⏳ Lade weitere Songs...
        </p>
      )}
      {!playlist && !isSearching && displayedTracks.length === 0 && (
        <p className="text-gray-500 p-6 text-center">
          🎵 Wähle links eine Playlist oder nutze die Suche.
        </p>
      )}
      {isSearching && hasSearched && !searchLoading && displayedTracks.length === 0 && (
        <p className="text-gray-500 p-6 text-center">
          Keine Suchergebnisse.
        </p>
      )}
      <div className="text-center text-gray-500 py-4"></div>
    </div>
  );
}
