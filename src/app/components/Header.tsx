"use client";

interface HeaderProps {
  username: string;
  onLogout?: () => void;
}





export default function Header({ username, onLogout }: HeaderProps) {
  return (
    <header className="flex justify-between items-center px-6 py-3 bg-black border-b border-gray-200 shadow-sm">
      <h1 className="text-xl font-bold text-gray-100">🎉 Party Dashboard</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-400">
          Eingeloggt als <b>{username}</b>
        </span>
        <button
          onClick={onLogout}
          className="bg-red-500 text-white px-3 py-1.5 rounded-md hover:bg-red-600 transition"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
