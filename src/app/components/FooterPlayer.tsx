"use client";

import { useEffect, useState } from "react";
import { Play, Pause, SkipForward, SkipBack } from "lucide-react";
import { Track } from "../lib/providers/types";

// Typen für Songdaten

declare global {
    interface Window {
        Spotify: any;
        onSpotifyWebPlaybackSDKReady: () => void;
    }
}

export default function FooterPlayer() {
    const [player, setPlayer] = useState<any>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [track, setTrack] = useState<Track | null>(null);
    const [isReady, setIsReady] = useState(false);

    // Spotify Script laden
    useEffect(() => {
        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        document.body.appendChild(script);

        window.onSpotifyWebPlaybackSDKReady = () => {
            const player = new window.Spotify.Player({
                name: "Party Player",
                getOAuthToken: async (cb: (token: string) => void) => {
                    const res = await fetch("/api/auth/token");
                    const data = await res.json();
                    cb(data.access_token);
                },
                volume: 0.5,
            });

            // Player Events
            player.addListener("ready", ({ device_id }: any) => {
                console.log("Spotify Player ready with ID:", device_id);
                setDeviceId(device_id);
                setIsReady(true);
            });

            player.addListener("not_ready", ({ device_id }: any) => {
                console.log("Device ID has gone offline", device_id);
                setIsReady(false);
            });

            player.addListener("player_state_changed", (state: any) => {
                if (!state) return;
                const current = state.track_window.current_track;
                console.log("Aktueller Track:", current);
                setTrack({
                    id: current.id,
                    uri: current.uri,
                    name: current.name,
                    artist: current.artists.map((a: any) => a.name).join(", "),
                    albumArt: current.album.images[0].url,
                    durationMs: state.duration,
                    progressMs: state.position,
                    isplaying: !state.paused,
                });
            });
            player.connect();
            setPlayer(player);
        };
    }, []);

    // Fortschritt lokal animieren
    useEffect(() => {
        if (!track || !track.isplaying) return;

        const start = Date.now();
        const initial = track.progressMs;

        const interval = setInterval(() => {
            setTrack((prev) => {
                if (!prev || !prev.isplaying) return prev;
                const elapsed = Date.now() - start;
                const newProgress = initial + elapsed;

                if (newProgress >= prev.durationMs) {
                    clearInterval(interval);
                    return { ...prev, progressMs: prev.durationMs };
                }

                return { ...prev, progressMs: newProgress };
            });
        }, 1000); // jede Sekunde aktualisieren

        return () => clearInterval(interval);
    }, [track?.isplaying, track?.id]);


    // Spotify API: Gerät aktivieren
    useEffect(() => {
        const activateDevice = async () => {
            if (!deviceId) return;

            const res = await fetch("/api/auth/token");
            const data = await res.json();
            const token = data.access_token;

            if (!token) {
                console.error("Kein Token beim Aktivieren gefunden");
                return;
            }

            await fetch("https://api.spotify.com/v1/me/player", {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ device_ids: [deviceId], play: true }),
            });
        };
        activateDevice();
    }, [deviceId]);


    const handlePlayPause = async () => {
        if (!player) return;
        const state = await player.getCurrentState();
        if (state?.paused) {
            await player.resume();
        } else {
            await player.pause();
        }
        
    };

    const handleNext = async () => {
        if (player) await player.nextTrack();
    };

    const handlePrev = async () => {
        if (player) await player.previousTrack();
    };
    const activatePlayer = async () => {
        player.activateElement();
    
    };
    const formatTime = (ms: number) => {
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        return `${min}:${sec.toString().padStart(2, "0")}`;
    };

    if (!track)
        return (
            <footer className="h-24 bg-neutral-900 text-gray-300 flex items-center justify-center border-t border-neutral-800">
                <p>🎶 Lade Spotify Player...</p>
            </footer>
        );

    return (
        <footer className="h-24 bg-neutral-900 text-gray-200 flex items-center justify-between px-6 border-t border-neutral-800 shadow-[0_-2px_10px_rgba(0,0,0,0.5)]">
            {/* Song Infos */}
            <div className="flex items-center gap-4 w-1/3">
                <img
                    src={track.albumArt}
                    alt={track.name}
                    className="w-14 h-14 rounded-md object-cover shadow-lg"
                />
                <div>
                    <p className="font-medium text-gray-100">{track.name}</p>
                    <p className="text-sm text-gray-400">{track.artist}</p>
                </div>
            </div>

            {/* Steuerung */}
            <div className="flex flex-col items-center w-1/3">
                <div className="flex items-center gap-6 mb-2">
                    <button
                        onClick={handlePrev}
                        className="text-gray-300 hover:text-white transition"
                    >
                        <SkipBack size={22} />
                    </button>
                    <button
                        onClick={handlePlayPause}
                        className="bg-white text-black p-3 rounded-full hover:bg-gray-300 transition"
                    >
                        {track.isplaying ? <Pause size={22} /> : <Play size={22} />}
                    </button>
                    <button
                        onClick={handleNext}
                        className="text-gray-300 hover:text-white transition"
                    >
                        <SkipForward size={22} />
                    </button>
                </div>

                {/* Progressbar */}
                <div className="flex items-center gap-2 w-150">
                    <span className="text-xs text-gray-400">
                        {formatTime(track.progressMs || 0)}
                    </span>
                    <div className="relative flex-1 h-1 bg-neutral-700 rounded-full overflow-hidden">
                        <div
                            className="absolute h-1 bg-green-500 rounded-full"
                            style={{
                                width: `${(track.progressMs && track.durationMs ? track.progressMs / track.durationMs : 0) * 100}%`,
                            }}
                        />
                    </div>
                    <span className="text-xs text-gray-400">
                        {formatTime(track.durationMs || 0)}
                    </span>
                </div>
            </div>

            {/* Rechts */}
            <div onClick={activatePlayer} className="w-1/3 text-right text-sm text-gray-400">
                {isReady ? "🟢 Verbunden" : "⚫️ Nicht verbunden"}
                
            </div>
        </footer>
    );
}
