"use client";

import Header from "@/app/components/Header";
import FooterPlayer from "@/app/components/FooterPlayer";
import PlaylistSidebar from "@/app/components/PlaylistSidebar";
import { Playlist } from "../lib/providers/types";
import { useState } from "react";
import { useEffect } from "react";
import PlaylistTracks from "@/app/components/PlaylistTracks";
import PartyQueue from "@/app/components/PartyQueue";
import Split from "react-split";
import { Track } from "@/app/lib/providers/types";

export default function DashboardPage() {
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);




  const fetchPlaylists = async () => {
    try {
      const res = await fetch("/api/music/getplaylists");
      if (!res.ok) throw new Error("Failed to fetch playlists");
      const data = await res.json();
      console.log("Fetched playlists:", data);
      setPlaylists(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-neutral-800">
        <Header username="HostName" onLogout={() => console.log("Logout")} />
      </header>

      {/* Hauptinhalt */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Split
          className="flex flex-1 overflow-hidden"
          sizes={[20, 45, 35]} // Startgrößen in %
          minSize={[180, 800, 250]} // Mindestbreiten in px
          gutterSize={6}
          snapOffset={20}
          expandToMin={true}
          style={{ display: "flex" }}
        >
          {/* 1️⃣ Playlist Sidebar */}
            <div className=" bg-neutral-950 h-screen w-2/4 p-4 md:static md:w-1/5">
              <PlaylistSidebar playlists={playlists} onSelect={setSelectedPlaylist} />
            </div>

          {/* 2️⃣ Playlist Tracks */}
          <div className=" p-4 border-r border-neutral-800">
            <h2 className="text-2xl font-bold mb-4 text-gray-50">
              {selectedPlaylist?.name || "Keine Playlist ausgewählt"}
            </h2>
            <PlaylistTracks playlist={selectedPlaylist} />
          </div>

          {/* 3️⃣ Party Queue */}
          <div className="overflow-y-auto p-4 bg-neutral-950">
            <PartyQueue />
          </div>
        </Split>
      </div>

      {/* Footer */}
      <footer className="h-24 border-t border-neutral-800">
        <FooterPlayer />
      </footer>
    </div>
  );
}

