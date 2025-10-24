"use client";
import { useEffect, useState } from "react";
import { Playlist } from "../lib/providers/types";
import { Music } from "lucide-react";

interface PlaylistSidebarProps {
  playlists: Playlist[];
  onSelect: (playlist: string) => void;
}

export default function PlaylistSidebar({ playlists, onSelect }: any) {
  const [isCompact, setIsCompact] = useState(false);

  // erkennt Bildschirmgröße
useEffect(() => {
    const handleResize = () => {
      setIsCompact(window.innerWidth < 1100);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <aside
      className={`
        h-full 
        bg-neutral-900 
        border-r border-neutral-800 
        flex flex-col 
        overflow-hidden
        transition-all duration-300
        ${isCompact ? "w-[80px]" : "w-full"}
      `}
    >
      {/* Header */}
      <div
        className="
          sticky top-0 bg-neutral-900 z-10
          flex items-center gap-2
          px-4 py-3 border-b border-neutral-800
        "
      >
        <Music size={20} className="flex-shrink-0 text-gray-300" />
        <h2
          className={`text-lg font-semibold text-gray-100 whitespace-nowrap overflow-hidden transition-all duration-300 ${isCompact ? "opacity-0 w-0" : "opacity-100 w-auto"
            }`}
        >
          Playlists
        </h2>
      </div>

      {/* Playlist-Liste */}
      <ul
        className={`
          flex-1 overflow-y-auto p-2 space-y-1 transition-all duration-300
          ${isCompact ? "px-1" : "px-3"}
        `}
      >
        {playlists.map((pl: any) => (
          <li
            key={pl.id}
            onClick={() => onSelect(pl)}
            className="
              flex items-center gap-3
              hover:bg-neutral-800 
              rounded-md 
              p-2 cursor-pointer 
              transition-colors
            "
          >
            {pl.imageUrl ? (
              <img
                src={pl.imageUrl}
                alt={pl.name}
                className="w-10 h-10 rounded-md object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 bg-neutral-700 rounded-md flex items-center justify-center">
                <Music size={16} className="text-gray-400" />
              </div>
            )}
            <span
              title={isCompact ? pl.name : undefined}
              className={`
    text-gray-100 text-sm truncate transition-all duration-200
    ${isCompact ? "opacity-0 w-0 overflow-hidden" : "opacity-100 w-auto"}
  `}
            >
              {pl.name}
            </span>

          </li>
        ))}
      </ul>
    </aside>
  );
}