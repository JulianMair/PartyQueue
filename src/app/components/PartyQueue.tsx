"use client";

export default function PartyQueue() {
  const queue = [
    { id: 1, name: "Counting Stars", artist: "OneRepublic" },
    { id: 2, name: "Blinding Lights", artist: "The Weeknd" },
    { id: 3, name: "Can't Hold Us", artist: "Macklemore & Ryan Lewis" },
  ];

  return (
    <div className="flex flex-col  h-full">
      <div className="sticky top-0 z-10 pb-2 mb-2 border-neutral-800">
        <h2 className="text-lg font-semibold">🎉 Party Queue</h2>
      </div>

      <ul className="space-y-2 overflow-y-auto pb-28">
        {queue.map((song) => (
          <li
            key={song.id}
            className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg p-3 hover:bg-neutral-800 transition"
          >
            <div>
              <p className="text-gray-100 font-medium truncate">{song.name}</p>
              <p className="text-gray-400 text-sm truncate">{song.artist}</p>
            </div>
            <button className="text-sm text-gray-400 hover:text-white transition">
              ✖
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
