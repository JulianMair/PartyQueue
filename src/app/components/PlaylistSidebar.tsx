"use client";

interface PlaylistSidebarProps {
  playlists: string[];
  onSelect: (playlist: string) => void;
}

export default function PlaylistSidebar({ playlists, onSelect }: PlaylistSidebarProps) {
  return (
    <aside className="w-1/4 bg-white border-r border-gray-200 p-4">
      <h2 className="text-lg font-semibold mb-4">Playlists</h2>
      <ul className="space-y-2">
        {playlists.map((pl) => (
          <li
            key={pl}
            onClick={() => onSelect(pl)}
            className="cursor-pointer rounded-lg px-3 py-2 hover:bg-gray-100 transition"
          >
            {pl}
          </li>
        ))}
      </ul>
    </aside>
  );
}
