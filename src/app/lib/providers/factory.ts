import { SpotifyProvider } from "./spotify/index";
import { ReccoBeatsProvider } from "./reccobeats/index";
import { AudioFeatureProvider, MusicProvider } from "./types";

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

/**
 * Einmalig erzeugter Merkmals-Anbieter (Story B1).
 *
 * Wird bewusst wiederverwendet statt bei jedem Aufruf neu gebaut: der
 * Zwischenspeicher für bereits geholte Merkmale steckt in der Instanz und
 * wäre bei jeder Neuerzeugung wieder leer.
 */
let audioFeatureProvider: AudioFeatureProvider | null = null;

/**
 * Liefert den Anbieter für Audio-Merkmale.
 *
 * Getrennt von getProvider, weil Wiedergabe und Merkmale aus verschiedenen
 * Quellen kommen: die Musik von Spotify, die Merkmale von ReccoBeats.
 * Der aufrufende Code sieht nur die Schnittstelle und muss nicht wissen,
 * wer dahinter antwortet.
 */
export function getAudioFeatureProvider(): AudioFeatureProvider {
  if (!audioFeatureProvider) {
    audioFeatureProvider = new ReccoBeatsProvider();
  }
  return audioFeatureProvider;
}
