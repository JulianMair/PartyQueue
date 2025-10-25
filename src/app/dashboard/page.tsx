"use client";
<<<<<<< HEAD

import Header from "@/app/components/Header";
import FooterPlayer from "@/app/components/FooterPlayer";
import PlaylistSidebar from "@/app/components/PlaylistSidebar";
import { useState } from "react";
import { useEffect } from "react";

export default function DashboardPage() {
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>("Playlist A");
  const [playlists] = useState<string[]>(["Playlist A", "Playlist B", "Playlist C"]);

  useEffect(() => {
  const script = document.createElement("script");
  script.src = "https://sdk.scdn.co/spotify-player.js";
  script.async = true;
  document.body.appendChild(script);
}, []);


  return (
    <div className="flex flex-col h-screen bg-neutral-50 text-gray-800">
      <Header username="HostName" onLogout={() => console.log("Logout")} />

      <div className="flex flex-1">
        <PlaylistSidebar playlists={playlists} onSelect={setSelectedPlaylist} />

        <main className="flex-1 p-6 overflow-y-auto">
          <h2 className="text-2xl font-bold mb-4">{selectedPlaylist}</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Tabelle oder Playlist-Inhalte hier */}
            <p className="p-6 text-gray-600">
              Songs aus <b>{selectedPlaylist}</b> werden hier angezeigt.
            </p>
          </div>
        </main>
      </div>

      <FooterPlayer />
    </div>
  );
}

=======
import { useEffect, useState } from "react";

type Track = {
  id: string;
  name: string;
  artist: string;
  albumArt?: string;
};

export default function DashboardPage() {
  const [track, setTrack] = useState<Track | null>(null);

  const fetchCurrentTrack = async () => {
    const res = await fetch("/api/music/current");
    if (res.ok) {
      setTrack(await res.json());
    }
  };

  useEffect(() => {
    fetchCurrentTrack();
    const interval = setInterval(fetchCurrentTrack, 5000);
    return () => clearInterval(interval);
  }, []);

  const action = async (cmd: string) => {
    await fetch(`/api/music/${cmd}`, { method: "POST" });
    fetchCurrentTrack();
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-neutral-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-6">🎶 Party Dashboard</h1>

      {track ? (
        <div className="flex flex-col items-center gap-4 bg-neutral-800 p-6 rounded-2xl shadow-lg">
          {track.albumArt && (
            <img
              src={track.albumArt}
              alt={track.name}
              className="w-56 h-56 rounded-xl shadow-md"
            />
          )}
          <div className="text-center">
            <h2 className="text-2xl font-semibold">{track.name}</h2>
            <p className="text-gray-400">{track.artist}</p>
          </div>

          <div className="flex gap-4 mt-4">
            <button
              onClick={() => action("play")}
              className="px-5 py-2 rounded-lg bg-green-500 hover:bg-green-600 transition"
            >
              ▶ Play
            </button>
            <button
              onClick={() => action("pause")}
              className="px-5 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 transition"
            >
              ⏸ Pause
            </button>
            <button
              onClick={() => action("next")}
              className="px-5 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 transition"
            >
              ⏭ Next
            </button>
          </div>
        </div>
      ) : (
        <p className="text-gray-400 mt-10">
          Kein Song wird gerade abgespielt 🎧
        </p>
      )}
    </main>
  );
}
>>>>>>> 3f5dd52 (Initial commit)
