import { cookies } from "next/headers";

export async function getSpotifyToken() {
    const cookieStore = await cookies();
    const token = cookieStore.get("spotify_access_token")?.value;
    if (!token) throw new Error("No token");
    return token;
}
