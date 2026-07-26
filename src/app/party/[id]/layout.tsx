import type { Viewport } from "next";

// Wird serverseitig in den <head> gerendert. Vorher stand das viewport-meta
// im JSX-Body der Client-Component — beim ersten Load war es damit noch nicht
// aktiv, weshalb iOS Safari beim Fokussieren des Suchfelds reingezoomt und
// danach nicht zurückgezoomt hat (verzerrte Seite).
//
// Bewusst ohne user-scalable=no / maximum-scale: iOS ignoriert das seit iOS 10
// ohnehin und es bricht Pinch-Zoom für Nutzer die ihn brauchen. Der wirksame
// Fix gegen den Auto-Zoom ist font-size >= 16px auf allen Eingabefeldern.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function PartyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
