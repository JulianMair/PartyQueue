"use client";

interface HeaderProps {
  username: string;
  avatarUrl?: string;
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

export default function Header({
  username,
  avatarUrl,
  onLogout,
  isLoggingOut = false,
}: HeaderProps) {
  return (
    <header className="flex justify-between items-center px-6 py-3 bg-black border-b border-gray-200 shadow-sm">
      <h1 className="text-xl font-bold text-gray-100">🎉 Party Dashboard</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={username}
              className="h-8 w-8 rounded-full object-cover border border-neutral-700"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-neutral-800 border border-neutral-700" />
          )}
          <span className="text-sm text-gray-400 truncate max-w-[220px]">
            Eingeloggt als <b>{username}</b>
          </span>
        </div>
        <button
          onClick={onLogout}
          disabled={isLoggingOut}
          className="bg-red-500 text-white px-3 py-1.5 rounded-md hover:bg-red-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoggingOut ? "Logout..." : "Logout"}
        </button>
      </div>
    </header>
  );
}
