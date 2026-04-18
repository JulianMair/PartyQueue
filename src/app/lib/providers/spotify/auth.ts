import { cookies } from "next/headers";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const BASIC_AUTH = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

const ACCESS_TOKEN_COOKIE = "spotify_access_token";
const REFRESH_TOKEN_COOKIE = "spotify_refresh_token";
const ACCESS_TOKEN_EXPIRES_AT_COOKIE = "spotify_access_token_expires_at";
const TOKEN_EXPIRY_SKEW_MS = 30_000;
const APP_TOKEN_EXPIRY_SKEW_MS = 30_000;
let appAccessTokenCache: { token: string; expiresAt: number } | null = null;

function getCookieOptions(maxAge: number) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
        maxAge,
    };
}

export async function clearSpotifyAuthCookies() {
    const cookieStore = await cookies();
    const expired = getCookieOptions(0);
    cookieStore.set(ACCESS_TOKEN_COOKIE, "", expired);
    cookieStore.set(REFRESH_TOKEN_COOKIE, "", expired);
    cookieStore.set(ACCESS_TOKEN_EXPIRES_AT_COOKIE, "", expired);
}

function parseExpiresAt(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) return null;
    return parsed;
}

export async function refreshSpotifyAccessToken(): Promise<string | null> {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
    if (!refreshToken) return null;
    if (!CLIENT_ID || !CLIENT_SECRET) return null;

    try {
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: `Basic ${BASIC_AUTH}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }),
            cache: "no-store",
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || typeof data?.access_token !== "string") {
            console.error("Spotify refresh failed:", data);
            if (data?.error === "invalid_grant") {
                await clearSpotifyAuthCookies();
            }
            return null;
        }

        const expiresIn = Math.max(60, Number(data.expires_in) || 3600);
        const expiresAt = Date.now() + expiresIn * 1000;

        cookieStore.set(ACCESS_TOKEN_COOKIE, data.access_token, getCookieOptions(expiresIn));
        cookieStore.set(
            ACCESS_TOKEN_EXPIRES_AT_COOKIE,
            String(expiresAt),
            getCookieOptions(expiresIn + 300)
        );

        if (typeof data.refresh_token === "string" && data.refresh_token.length > 0) {
            cookieStore.set(REFRESH_TOKEN_COOKIE, data.refresh_token, getCookieOptions(30 * 24 * 60 * 60));
        }

        return data.access_token;
    } catch (error) {
        console.error("Spotify refresh request failed:", error);
        return null;
    }
}

export async function getSpotifyToken() {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
    const expiresAt = parseExpiresAt(cookieStore.get(ACCESS_TOKEN_EXPIRES_AT_COOKIE)?.value);

    if (accessToken) {
        // Legacy sessions may not have expires-at metadata yet.
        // In that case we use the token and rely on 401 retry-refresh in spotifyApiFetch.
        if (!refreshToken || !expiresAt) return accessToken;
        if (expiresAt && Date.now() < expiresAt - TOKEN_EXPIRY_SKEW_MS) return accessToken;

        const refreshedAccessToken = await refreshSpotifyAccessToken();
        return refreshedAccessToken ?? accessToken;
    }

    const refreshedAccessToken = await refreshSpotifyAccessToken();
    if (refreshedAccessToken) return refreshedAccessToken;

    throw new Error("No token");
}

const DEFAULT_SPOTIFY_FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
    // Falls der Aufrufer bereits einen AbortController uebergibt, nicht ueberschreiben.
    if (init.signal) {
        return fetch(input, init);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

export async function spotifyApiFetch(
    input: string,
    init?: RequestInit
): Promise<Response> {
    const doRequest = async (token: string) => {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${token}`);
        return fetchWithTimeout(
            input,
            {
                ...init,
                headers,
                cache: init?.cache ?? "no-store",
            },
            DEFAULT_SPOTIFY_FETCH_TIMEOUT_MS
        );
    };

    const token = await getSpotifyToken();
    const initialResponse = await doRequest(token);
    if (initialResponse.status !== 401) {
        return initialResponse;
    }

    const refreshedToken = await refreshSpotifyAccessToken();
    if (!refreshedToken || refreshedToken === token) {
        return initialResponse;
    }

    return doRequest(refreshedToken);
}

async function getSpotifyAppToken(forceRefresh = false): Promise<string> {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error("Missing Spotify client credentials");
    }

    if (
        !forceRefresh &&
        appAccessTokenCache &&
        Date.now() < appAccessTokenCache.expiresAt - APP_TOKEN_EXPIRY_SKEW_MS
    ) {
        return appAccessTokenCache.token;
    }

    const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            Authorization: `Basic ${BASIC_AUTH}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "client_credentials",
        }),
        cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data?.access_token !== "string") {
        throw new Error("Spotify app token request failed");
    }

    const expiresIn = Math.max(60, Number(data.expires_in) || 3600);
    appAccessTokenCache = {
        token: data.access_token,
        expiresAt: Date.now() + expiresIn * 1000,
    };
    return appAccessTokenCache.token;
}

export async function spotifyClientCredentialsFetch(
    input: string,
    init?: RequestInit
): Promise<Response> {
    const doRequest = async (token: string) => {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, {
            ...init,
            headers,
            cache: init?.cache ?? "no-store",
        });
    };

    const token = await getSpotifyAppToken(false);
    const initialResponse = await doRequest(token);
    if (initialResponse.status !== 401) return initialResponse;

    const refreshedToken = await getSpotifyAppToken(true);
    return doRequest(refreshedToken);
}
