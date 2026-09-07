// src/app/lib/providers/spotify/genreHeuristics.ts
//
// Schätzt Klangmerkmale aus den Genres der Künstler (Story B2).
//
// Gebraucht, wenn der eigentliche Merkmals-Dienst nichts liefert. Dann
// bleibt als Anhaltspunkt nur, was Spotify noch herausgibt — und das
// Aussagekräftigste davon sind die Genres.
//
// Wichtig zum Verständnis: Das hier misst nichts. Ein Titel eines
// Techno-Künstlers bekommt hohes Tempo zugeschrieben, weil das für das
// Genre typisch ist, nicht weil jemand den Titel angehört hätte. Die
// Werte sind bewusst von Hand gewählt und nicht aus Daten gelernt —
// so bleiben sie nachvollziehbar und veränderbar.
//
// Die Funktion ist rein: gleiche Genres, gleiches Ergebnis, kein Netz.

/** Die vier geschätzten Werte, noch ohne Herkunftsangabe. */
export interface EstimatedFeatures {
  tempo: number;
  energy: number;
  danceability: number;
  valence: number;
}

/**
 * Fallback, wenn kein Genre passt.
 * Mittelwerte, die niemanden in eine Richtung drängen.
 */
export const NEUTRAL_ESTIMATE: EstimatedFeatures = {
  tempo: 110,
  energy: 0.55,
  danceability: 0.55,
  valence: 0.55,
};

/**
 * Zuordnung von Genre-Stichworten zu typischen Werten.
 *
 * Die Stichworte werden als Teilzeichenfolge geprüft, weil Spotify sehr
 * feingliedrige Genres vergibt: "german tech house" trifft über "house",
 * "melodic techno" über "techno".
 *
 * Die Reihenfolge spielt keine Rolle — passen mehrere Einträge, wird der
 * Durchschnitt gebildet.
 */
const GENRE_BUCKETS: { keywords: string[]; values: EstimatedFeatures }[] = [
  {
    keywords: ["techno", "trance", "hardstyle", "hardcore", "drum and bass", "dnb"],
    values: { tempo: 145, energy: 0.9, danceability: 0.8, valence: 0.5 },
  },
  {
    keywords: ["house", "edm", "electro", "dance", "club", "big room"],
    values: { tempo: 126, energy: 0.83, danceability: 0.85, valence: 0.65 },
  },
  {
    keywords: ["hip hop", "hip-hop", "rap", "trap", "deutschrap", "drill"],
    values: { tempo: 100, energy: 0.74, danceability: 0.78, valence: 0.55 },
  },
  {
    keywords: ["reggaeton", "latin", "salsa", "bachata", "cumbia"],
    values: { tempo: 100, energy: 0.78, danceability: 0.85, valence: 0.72 },
  },
  {
    keywords: ["pop", "k-pop"],
    values: { tempo: 116, energy: 0.7, danceability: 0.72, valence: 0.7 },
  },
  {
    keywords: ["schlager", "volksmusik", "partyschlager", "apres-ski", "après-ski"],
    values: { tempo: 130, energy: 0.75, danceability: 0.7, valence: 0.85 },
  },
  {
    keywords: ["r&b", "soul", "funk", "disco"],
    values: { tempo: 105, energy: 0.65, danceability: 0.75, valence: 0.65 },
  },
  {
    keywords: ["rock", "metal", "punk", "grunge", "alternative"],
    values: { tempo: 132, energy: 0.86, danceability: 0.52, valence: 0.5 },
  },
  {
    keywords: ["indie", "folk", "singer-songwriter", "acoustic"],
    values: { tempo: 105, energy: 0.5, danceability: 0.5, valence: 0.55 },
  },
  {
    keywords: ["jazz", "blues", "swing"],
    values: { tempo: 110, energy: 0.45, danceability: 0.5, valence: 0.5 },
  },
  {
    keywords: ["chill", "ambient", "lo-fi", "lofi", "downtempo"],
    values: { tempo: 88, energy: 0.32, danceability: 0.45, valence: 0.5 },
  },
  {
    keywords: ["classical", "orchestra", "soundtrack", "score", "piano"],
    values: { tempo: 92, energy: 0.35, danceability: 0.25, valence: 0.5 },
  },
];

/**
 * Schätzt aus einer Liste von Genres die vier Klangwerte.
 *
 * Passen mehrere Einträge — etwa "deutschrap" und "pop" —, wird der
 * Durchschnitt gebildet. Das trifft Mischformen besser, als sich für
 * einen Eintrag zu entscheiden.
 *
 * Passt keiner oder ist die Liste leer, kommen neutrale Mittelwerte
 * zurück. Das ist ehrlicher, als etwas zu behaupten: der Titel wird
 * dadurch später weder bevorzugt noch benachteiligt.
 */
export function estimateFromGenres(genres: string[]): EstimatedFeatures {
  if (!Array.isArray(genres) || genres.length === 0) {
    return { ...NEUTRAL_ESTIMATE };
  }

  const lowered = genres
    .filter((genre): genre is string => typeof genre === "string")
    .map((genre) => genre.toLowerCase());

  const matches = GENRE_BUCKETS.filter((bucket) =>
    bucket.keywords.some((keyword) => lowered.some((genre) => genre.includes(keyword)))
  );

  if (matches.length === 0) return { ...NEUTRAL_ESTIMATE };

  // Durchschnitt über alle passenden Einträge.
  const total = matches.reduce(
    (sum, bucket) => ({
      tempo: sum.tempo + bucket.values.tempo,
      energy: sum.energy + bucket.values.energy,
      danceability: sum.danceability + bucket.values.danceability,
      valence: sum.valence + bucket.values.valence,
    }),
    { tempo: 0, energy: 0, danceability: 0, valence: 0 }
  );

  return {
    tempo: total.tempo / matches.length,
    energy: total.energy / matches.length,
    danceability: total.danceability / matches.length,
    valence: total.valence / matches.length,
  };
}
