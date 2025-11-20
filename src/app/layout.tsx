import type { Metadata } from "next";
import "./globals.css";
import { PartyProvider } from "./context/PartyContext";
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {



  
  return (
    <html lang="en">
      <body
      >
        <PartyProvider>
          {children}
        </PartyProvider>
      </body>
    </html>
  );
}
