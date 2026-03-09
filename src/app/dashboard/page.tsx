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
    <div className="flex flex-col h-[100dvh] bg-neutral-950 text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="h-14 md:h-16 border-b border-neutral-800 shrink-0 bg-neutral-950/95 backdrop-blur">
        <Header username="HostName" onLogout={() => console.log("Logout")} />
      </header>

      {/* Hauptinhalt */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {isTabletLayout ? (
          <>
            <div className="px-3 pt-2 shrink-0">
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

            <div className="flex-1 min-h-0 overflow-hidden p-3 pt-2">
              {activePane === "playlists" && (
                <div className="h-full min-h-0 rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                  <PlaylistSidebar
                    playlists={playlists}
                    onSelect={setSelectedPlaylist}
                    forceExpanded={true}
                  />
                </div>
              )}

              {activePane === "tracks" && (
                <div className="h-full min-h-0 p-3 border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900 shadow-[0_8px_24px_rgba(0,0,0,0.35)] flex flex-col">
                  <h2 className="text-lg md:text-xl font-bold mb-3 text-gray-50 truncate shrink-0">
                    {selectedPlaylist?.name || "Keine Playlist ausgewählt"}
                  </h2>
                  <div className="flex-1 min-h-0">
                    <PlaylistTracks playlist={selectedPlaylist} />
                  </div>
                </div>
              )}

              {activePane === "queue" && (
                <div className="h-full min-h-0 p-3 border border-neutral-800 rounded-xl bg-neutral-900 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                  <div className="h-full min-h-0">
                    <PartyQueue />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <Split
            className="flex flex-1 overflow-hidden"
            sizes={[22, 43, 35]}
            minSize={[220, 520, 320]}
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
            <div className="p-4 border-r border-neutral-800 min-w-0 flex flex-col">
              <h2 className="text-2xl font-bold mb-4 text-gray-50 truncate shrink-0">
                {selectedPlaylist?.name || "Keine Playlist ausgewählt"}
              </h2>
              <div className="flex-1 min-h-0">
                <PlaylistTracks playlist={selectedPlaylist} />
              </div>
            </div>

            {/* 3️⃣ Party Queue */}
            <div className="p-4 bg-neutral-950 min-w-0 min-h-0">
              <div className="h-full min-h-0 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-[0_10px_28px_rgba(0,0,0,0.35)] p-3">
                <PartyQueue />
              </div>
            </div>
          </Split>
        )}
      </div>

      {/* Footer */}
      <footer className="h-20 md:h-24 border-t border-neutral-800 shrink-0 bg-neutral-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <FooterPlayer />
      </footer>
    </div>
  );
}
