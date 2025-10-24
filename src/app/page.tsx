"use client";

import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    // 🔹 ruft deine API-Route auf, die weiter zu Spotify leitet
    window.location.href = "/api/auth/login";
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <h1 className="text-4xl font-bold mb-8">Willkommen 🎧</h1>

      <button
        onClick={handleLogin}
        disabled={loading}
        className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition"
      >
        {loading ? "Verbinde..." : "Mit Spotify anmelden"}
      </button>
    </div>
  );
}
