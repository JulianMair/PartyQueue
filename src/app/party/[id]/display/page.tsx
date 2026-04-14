"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PartyDisplayRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/display");
  }, [router]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
      <p className="text-neutral-500 text-xl">Weiterleitung...</p>
    </div>
  );
}
