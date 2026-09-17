// vitest.config.ts
//
// Minimale Konfiguration (Story F1). Testet nur reine Node-Logik, deshalb
// kein DOM-Environment, keine Next.js-spezifische Einrichtung nötig.

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite entdeckt sonst automatisch die postcss.config.mjs des Next.js-Setups
  // und versucht sie zu laden, obwohl unsere Tests kein CSS anfassen — das
  // schlägt fehl, weil die dortigen Plugins nicht zu Vites CSS-Pipeline
  // passen. Leere Konfiguration verhindert die automatische Suche.
  css: { postcss: {} },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
