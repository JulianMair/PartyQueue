"use client";

import { useEffect, useState } from "react";
import { Track } from "../lib/providers/types";
import { Playlist } from "../lib/providers/types";


interface PlaylistTracksProps {
  playlist: Playlist | null;
}


export default function PlaylistTracks({ playlist }: PlaylistTracksProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  useEffect(() => {
    if (!playlist?.id) return;
    setLoading(true);

    fetch(`/api/music/playlists/${playlist.id}/tracks`)
      .then((res) => res.json())
      .then((data) => setTracks(data))
      .catch((err) => console.error("Fehler beim Laden der Songs:", err))
      .finally(() => {setLoading(false)});
  }, [playlist]);

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

  const formatDuration = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  if (!playlist) {
    return (
      <div className="text-gray-400">
        Wähle links eine Playlist aus, um Songs anzuzeigen.
      </div>
    );
  }

  if (loading) {
    return <p className="text-gray-400">🎵 Songs werden geladen...</p>;
  }

  return (
  <div className="h-full overflow-y-auto pr-2" style={{ paddingBottom: "calc(var(--footer-h) + 1rem)" }}>  {/* <-- Scroll + Puffer unten */}
    {tracks.length === 0 ? (
      <p className="text-gray-500">Keine Songs gefunden.</p>
    ) : (
      <ul className="space-y-2">
        {tracks.map((track) => (
          <li
            key={track.id}
            className="flex items-center gap-4 bg-neutral-900 border border-neutral-800 rounded-lg p-3 hover:bg-neutral-800 transition"
            onClick={() => setSelectedTrack(track)}
            onDoubleClick={() => playTrack(track)}
          >
            {track.albumArt && (
              <img src={track.albumArt} alt={track.name} className="w-12 h-12 rounded-md object-cover" />
            )}
            <div className="flex-1">
              <p className="text-gray-100 font-medium truncate">{track.name}</p>
              <p className="text-gray-400 text-sm truncate">{track.artist}</p>
            </div>
            <p className="text-gray-500 text-sm">{formatDuration(track.durationMs)}</p>
          </li>
        ))}
      </ul>
    )}
  </div>
);
}
