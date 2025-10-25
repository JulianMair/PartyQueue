"use client";

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
