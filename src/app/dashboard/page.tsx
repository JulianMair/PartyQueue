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

export default function DashboardPage() {
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [viewportWidth, setViewportWidth] = useState<number>(1400);
  const [activePane, setActivePane] = useState<"playlists" | "tracks" | "queue">("tracks");
  const isTabletLayout = viewportWidth < 1180;

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

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-neutral-800">
        <Header username="HostName" onLogout={() => console.log("Logout")} />
      </header>

      {/* Hauptinhalt */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isTabletLayout ? (
          <>
            <div className="px-3 pt-3">
              <div className="grid grid-cols-3 gap-2 bg-neutral-900 border border-neutral-800 rounded-lg p-1">
                <button
                  onClick={() => setActivePane("playlists")}
                  className={`px-3 py-2 text-sm rounded-md transition ${
                    activePane === "playlists"
                      ? "bg-neutral-700 text-white"
                      : "text-gray-300 hover:bg-neutral-800"
                  }`}
                >
                  Playlists
                </button>
                <button
                  onClick={() => setActivePane("tracks")}
                  className={`px-3 py-2 text-sm rounded-md transition ${
                    activePane === "tracks"
                      ? "bg-neutral-700 text-white"
                      : "text-gray-300 hover:bg-neutral-800"
                  }`}
                >
                  Tracks
                </button>
                <button
                  onClick={() => setActivePane("queue")}
                  className={`px-3 py-2 text-sm rounded-md transition ${
                    activePane === "queue"
                      ? "bg-neutral-700 text-white"
                      : "text-gray-300 hover:bg-neutral-800"
                  }`}
                >
                  Queue
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-3">
              {activePane === "playlists" && (
                <div className="h-full rounded-lg overflow-hidden border border-neutral-800">
                  <PlaylistSidebar
                    playlists={playlists}
                    onSelect={setSelectedPlaylist}
                    forceExpanded={true}
                  />
                </div>
              )}

              {activePane === "tracks" && (
                <div className="h-full p-3 border border-neutral-800 rounded-lg overflow-hidden">
                  <h2 className="text-xl font-bold mb-3 text-gray-50 truncate">
                    {selectedPlaylist?.name || "Keine Playlist ausgewählt"}
                  </h2>
                  <PlaylistTracks playlist={selectedPlaylist} />
                </div>
              )}

              {activePane === "queue" && (
                <div className="h-full p-3 border border-neutral-800 rounded-lg bg-neutral-950 overflow-hidden">
                  <PartyQueue />
                </div>
              )}
            </div>
          </>
        ) : (
          <Split
            className="flex flex-1 overflow-hidden"
            sizes={[20, 45, 35]}
            minSize={[160, 420, 260]}
            gutterSize={6}
            snapOffset={20}
            expandToMin={true}
            style={{ display: "flex" }}
          >
            {/* 1️⃣ Playlist Sidebar */}
            <div className="bg-neutral-950 p-4 min-w-0">
              <PlaylistSidebar playlists={playlists} onSelect={setSelectedPlaylist} />
            </div>

            {/* 2️⃣ Playlist Tracks */}
            <div className="p-4 border-r border-neutral-800 min-w-0">
              <h2 className="text-2xl font-bold mb-4 text-gray-50 truncate">
                {selectedPlaylist?.name || "Keine Playlist ausgewählt"}
              </h2>
              <PlaylistTracks playlist={selectedPlaylist} />
            </div>

            {/* 3️⃣ Party Queue */}
            <div className="overflow-y-auto p-4 bg-neutral-950 min-w-0">
              <PartyQueue />
            </div>
          </Split>
        )}
      </div>

      {/* Footer */}
      <footer className="h-24 border-t border-neutral-800">
        <FooterPlayer />
      </footer>
    </div>
  );
}
