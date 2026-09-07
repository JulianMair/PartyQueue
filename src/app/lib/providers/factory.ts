import { SpotifyProvider } from "./spotify/index";
import { SpotifyFallbackFeatureProvider } from "./spotify/audioFeatures";
import { ReccoBeatsProvider, isReccoBeatsEnabled } from "./reccobeats/index";
import { AudioFeatureChain } from "./audioFeatureChain";
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
 *
 * Zurückgegeben wird eine Kette (Story B2): zuerst ReccoBeats mit echten
 * Messwerten, danach das Rückfallverfahren, das aus Spotify-Genres
 * schätzt. Hier ist die einzige Stelle, an der die Reihenfolge steht.
 *
 * Ist ReccoBeats über RECCOBEATS_ENABLED=false abgeschaltet, besteht die
 * Kette nur aus dem Rückfallverfahren.
 */
export function getAudioFeatureProvider(): AudioFeatureProvider {
  if (!audioFeatureProvider) {
    const providers: AudioFeatureProvider[] = [];
    if (isReccoBeatsEnabled()) {
      providers.push(new ReccoBeatsProvider());
    }
    providers.push(new SpotifyFallbackFeatureProvider());
    audioFeatureProvider = new AudioFeatureChain(providers);
  }
  return audioFeatureProvider;
}
