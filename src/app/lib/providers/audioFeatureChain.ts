// src/app/lib/providers/audioFeatureChain.ts
//
// Verkettet mehrere Merkmals-Anbieter zu einem (Story B2).
//
// Der erste Anbieter bekommt alle angefragten Titel. Was er nicht
// beantworten kann, geht an den nächsten — und so weiter. Für den
// aufrufenden Code sieht das aus wie ein einziger Anbieter.
//
// Dadurch bleibt die Reihenfolge an einer Stelle festgelegt (in der
// Factory) und muss nicht in jedem Anbieter bekannt sein. Ein weiterer
// Dienst liesse sich später einfach dazwischenhängen.

import type { AudioFeatureProvider, AudioFeatures } from "./types";

export class AudioFeatureChain implements AudioFeatureProvider {
  readonly name: string;

  /**
   * @param providers In der Reihenfolge, in der sie befragt werden sollen.
   *                  Der verlässlichste zuerst.
   */
  constructor(private readonly providers: AudioFeatureProvider[]) {
    this.name = `chain(${providers.map((provider) => provider.name).join(" -> ")})`;
  }

  /**
   * Fragt die Anbieter der Reihe nach, bis alle Titel beantwortet sind.
   *
   * Nach jedem Anbieter bleibt nur übrig, wozu noch nichts vorliegt. Ist
   * die Liste leer, wird gar nicht weitergefragt — der Rückfall kostet
   * also nichts, solange der Hauptanbieter arbeitet.
   *
   * Wirft ein Anbieter eine Ausnahme, wird sie hier abgefangen und mit dem
   * nächsten weitergemacht. Genau dafür gibt es die Kette: ein Ausfall
   * darf nicht das ganze Verfahren beenden.
   */
  async getAudioFeatures(trackIds: string[]): Promise<Map<string, AudioFeatures | null>> {
    const result = new Map<string, AudioFeatures | null>();
    if (!Array.isArray(trackIds) || trackIds.length === 0) return result;

    let pending = Array.from(
      new Set(trackIds.filter((id) => typeof id === "string" && id.length > 0))
    );

    for (const provider of this.providers) {
      if (pending.length === 0) break;

      let answers: Map<string, AudioFeatures | null>;
      try {
        answers = await provider.getAudioFeatures(pending);
      } catch (error) {
        console.warn(`[audio-features] Anbieter ${provider.name} ausgefallen:`, error);
        continue;
      }

      const stillMissing: string[] = [];
      for (const trackId of pending) {
        const features = answers.get(trackId);
        if (features) {
          result.set(trackId, features);
        } else {
          stillMissing.push(trackId);
        }
      }
      pending = stillMissing;
    }

    // Was auch der letzte Anbieter nicht beantworten konnte, wird als
    // "nichts gefunden" ausgewiesen — nicht einfach weggelassen.
    for (const trackId of pending) {
      result.set(trackId, null);
    }

    return result;
  }
}
