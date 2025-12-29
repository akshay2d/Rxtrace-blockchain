"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";

type HeaderState = {
  companyName: string | null;
  walletBalance: number | null;
  profileInitial: string;
};

export default function Header() {
  const [state, setState] = useState<HeaderState>({
    companyName: null,
    walletBalance: null,
    profileInitial: "A",
  });

  const walletText = useMemo(() => {
    if (state.walletBalance === null) return "Wallet: —";
    const rounded = Math.round(state.walletBalance);
    return `Wallet: ₹${rounded.toLocaleString("en-IN")}`;
  }, [state.walletBalance]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { user } } = await supabaseClient().auth.getUser();
        if (!user) return;

        const emailInitial = (user.email || "").trim().charAt(0).toUpperCase();
        const nameInitial = (String((user.user_metadata as any)?.full_name ?? "").trim().charAt(0) || "").toUpperCase();
        const initial = nameInitial || emailInitial || "A";

        const res = await fetch("/api/billing/wallet", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (res.ok) {
          setState({
            companyName: body?.company_name ?? null,
            walletBalance: typeof body?.balance === "number" ? body.balance : null,
            profileInitial: initial,
          });
        } else {
          setState((prev) => ({ ...prev, profileInitial: initial }));
        }
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

      {/* Wallet */}
      <div className="text-sm font-medium text-blue-700">
        {walletText}
      </div>

      {/* Company */}
      <div className="text-sm text-gray-700">
        {state.companyName ?? "RxTrace India"}
      </div>

      {/* Profile */}
      <div className="w-8 h-8 rounded-full bg-blue-700 text-white flex items-center justify-center text-sm font-semibold">
        {state.profileInitial}
      </div>
    </header>
  );
}
