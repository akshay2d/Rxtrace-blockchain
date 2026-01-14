"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";

type HeaderState = {
  companyName: string | null;
  profileInitial: string;
};

export default function Header() {
  const [state, setState] = useState<HeaderState>({
    companyName: null,
    profileInitial: "A",
  });

  const companyText = useMemo(() => state.companyName ?? "RxTrace India", [state.companyName]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { user } } = await supabaseClient().auth.getUser();
        if (!user) return;

        const emailInitial = (user.email || "").trim().charAt(0).toUpperCase();
        const nameInitial = (String((user.user_metadata as any)?.full_name ?? "").trim().charAt(0) || "").toUpperCase();
        const initial = nameInitial || emailInitial || "A";

        const res = await fetch("/api/billing/subscription", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (res.ok) {
          setState({
            companyName: body?.company?.company_name ?? null,
            profileInitial: initial,
          });
          return;
        }

        setState((prev) => ({ ...prev, profileInitial: initial }));
      } catch {
        // keep header stable even if fetch fails
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="h-14 bg-white border-b flex items-center justify-end px-6 gap-6">
      {/* Alerts */}
      <button
        aria-label="Alerts"
        className="text-gray-500 hover:text-gray-700"
      >
        🔔
      </button>

      {/* Company */}
      <div className="text-sm text-gray-700">
        {companyText}
      </div>

      {/* Profile */}
      <div className="w-8 h-8 rounded-full bg-blue-700 text-white flex items-center justify-center text-sm font-semibold">
        {state.profileInitial}
      </div>
    </header>
  );
}
