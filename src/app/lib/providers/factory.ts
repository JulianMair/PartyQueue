import { SpotifyProvider } from "./spotify/index";
import { MusicProvider } from "./types";

export function getProvider(providerName: string): MusicProvider {
  switch (providerName) {
    case "spotify":
      return new SpotifyProvider();
    // case "tidal":
    //   return new TidalProvider();
    default:
      throw new Error(`Unsupported provider: ${providerName}`);
  }
}
