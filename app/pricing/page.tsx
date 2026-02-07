"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { loadRazorpay } from "@/lib/razorpay";
import { supabaseClient } from "@/lib/supabase/client";

/* =========================================================
   TYPES
========================================================= */

type BillingCycle = "monthly" | "yearly";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  billing_cycle: BillingCycle;
  base_price: number;
  items: Array<{ label: string; value: string | null }>;
};

/* =========================================================
   PAGE
========================================================= */

export default function PricingPage() {
  const router = useRouter();

  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);

  /* ---------------- Fetch public plans ---------------- */

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/public/plans", { cache: "no-store" });
        const body = await res.json();

        if (body?.success) {
          const filtered: Plan[] = (body.plans || []).filter((p: Plan) => {
            const n = p.name.toLowerCase();
            return (
              (n.includes("starter") || n.includes("growth")) &&
              (p.billing_cycle === "monthly" || p.billing_cycle === "yearly")
            );
          });
          setPlans(filtered);
        }
      } catch (err) {
        console.error("[Pricing] Failed to load plans", err);
      } finally {
        setLoadingPlans(false);
      }
    })();
  }, []);

  /* ---------------- Subscribe ---------------- */

  async function subscribeToPlan(plan: Plan) {
    setMessage(null);

    const ok = await loadRazorpay();
    if (!ok) {
      setMessage("Razorpay failed to load.");
      return;
    }

    const name = plan.name.toLowerCase();
    const planType =
      name.includes("starter")
        ? "starter"
        : name.includes("growth")
        ? "growth"
        : "enterprise";

    if (planType === "enterprise") {
      router.push("/contact");
      return;
    }

    try {
      const res = await fetch("/api/billing/subscription/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan: planType,
          billing_cycle: plan.billing_cycle, // monthly | yearly
        }),
      });

      if (res.status === 401) {
        router.replace("/auth/signin");
        return;
      }

      const body = await res.json();
      if (!res.ok || !body?.subscription?.id) {
        setMessage(body?.error || "Failed to create subscription.");
        return;
      }

      const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!key) {
        setMessage("Razorpay key not configured.");
        return;
      }

      new (window as any).Razorpay({
        key,
        subscription_id: body.subscription.id,
        name: "RxTrace",
        description: `${plan.name} (${plan.billing_cycle})`,
        handler: async () => {
          await supabaseClient().auth.refreshSession();
          router.push("/dashboard/billing");
        },
        modal: {
          ondismiss: () => setMessage("Payment cancelled."),
        },
        theme: { color: "#2563eb" },
      }).open();
    } catch (err: any) {
      setMessage(err?.message || "Subscription failed.");
    }
  }

  /* ========================================================= */

  return (
    <main className="bg-white text-slate-900">
      {/* HEADER */}
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="RxTrace" width={36} height={36} />
            <span className="font-semibold">RxTrace</span>
          </Link>
          <nav className="flex gap-6 text-sm">
            <Link href="/pricing" className="text-blue-600">Pricing</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/auth/signin">Login</Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="bg-blue-600 text-white text-center py-12">
        <h1 className="text-3xl font-semibold">Simple pricing. Full access.</h1>
        <p className="mt-2 text-blue-100">
          GS1-compliant · ERP-agnostic · Built for scale
        </p>
      </section>

      {message && (
        <div className="max-w-5xl mx-auto px-6 mt-4">
          <div className="border rounded-lg p-3 text-sm bg-red-50 border-red-200 text-red-800">
            {message}
          </div>
        </div>
      )}

      {/* PLANS */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        {loadingPlans ? (
          <p className="text-center text-slate-600">Loading plans…</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const period =
                plan.billing_cycle === "monthly" ? "/ month" : "/ year";
              const price = `₹${plan.base_price.toLocaleString("en-IN")}${period}`;
              const items = plan.items.map((i) =>
                i.value ? `${i.label}: ${i.value}` : i.label
              );

              return (
                <PlanCard
                  key={`${plan.id}-${plan.billing_cycle}`}
                  title={`${plan.name} (${plan.billing_cycle === "monthly" ? "Monthly" : "Yearly"})`}
                  price={price}
                  items={items}
                  highlight={plan.name.toLowerCase().includes("growth")}
                  actionLabel="Subscribe"
                  onAction={() => subscribeToPlan(plan)}
                />
              );
            })}

            {/* ENTERPRISE */}
            <PlanCard
              title="Enterprise"
              price="Custom pricing"
              items={[
                "High-volume serialization",
                "Custom aggregation",
                "Dedicated support",
                "Regulatory consulting",
              ]}
              actionLabel="Contact Us"
              onAction={() => router.push("/contact")}
            />
          </div>
        )}
      </section>

      {/* FOOTER */}
      <footer className="border-t py-10 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} RxTrace India. All rights reserved.
      </footer>
    </main>
  );
}

/* =========================================================
   PLAN CARD
========================================================= */

function PlanCard({
  title,
  price,
  items,
  actionLabel,
  onAction,
  highlight = false,
}: {
  title: string;
  price: string;
  items: string[];
  actionLabel: string;
  onAction: () => void;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        highlight ? "border-blue-500 bg-blue-50" : "border-slate-200"
      }`}
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-2 text-2xl font-bold">{price}</div>
      <ul className="mt-4 space-y-1 text-sm text-slate-600">
        {items.slice(0, 5).map((i) => (
          <li key={i}>✔ {i}</li>
        ))}
      </ul>
      <button
        onClick={onAction}
        className={`mt-5 w-full py-2 rounded-lg text-sm font-medium ${
          highlight
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "border hover:bg-blue-600 hover:text-white"
        }`}
      >
        {actionLabel}
      </button>
    </div>
  );
}
