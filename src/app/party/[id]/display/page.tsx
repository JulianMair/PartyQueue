"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";

export default function PartyDisplayRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id: partyId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/display?partyId=${encodeURIComponent(partyId)}`);
  }, [router, partyId]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
      <p className="text-neutral-500 text-xl">Weiterleitung...</p>
    </div>
  );
}
