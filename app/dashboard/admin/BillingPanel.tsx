"use client";
import React, { useEffect, useState } from "react";
import { billingConfig } from "@/app/lib/billingConfig";

export default function BillingPanel() {
  const [credits, setCredits] = useState<number | null>(null);
  const [activeHeads, setActiveHeads] = useState<Record<string, boolean>>({
    unitBoxCartonPallet: true,
    searchModule: true,
    highLevelScan: true,
    handsetAllocation: true,
    billingModule: true,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/billing/credit")
      .then((r) => r.json())
      .then((data) => setCredits(data.credits))
      .catch(() => setCredits(null));
  }, []);

  async function toggleHead(key: string) {
    setLoading(true);
    const newVal = !activeHeads[key];
    setActiveHeads((s) => ({ ...s, [key]: newVal }));

    try {
      await fetch("/api/admin/heads/toggle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ head: key, enabled: newVal }),
      });
    } finally {
      setLoading(false);
    }
  }

  async function topUp(amount: number) {
    setLoading(true);
    try {
      await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const res = await fetch("/api/billing/credit");
      const data = await res.json();
      setCredits(data.credits);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-2xl font-semibold mb-4">Billing & Active Heads</h2>

      {/* CREDITS */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl shadow-sm border">
          <h3 className="font-semibold">Credits</h3>
          <p className="text-lg mt-2">
            {credits === null ? "—" : `₹${credits.toFixed(2)}`}
          </p>

          <div className="mt-3 flex gap-2">
            <button
              className="px-3 py-1 rounded-xl border"
              onClick={() => topUp(100)}
              disabled={loading}
            >
              Top-up ₹100
            </button>
            <button
              className="px-3 py-1 rounded-xl border"
              onClick={() => topUp(500)}
              disabled={loading}
            >
              Top-up ₹500
            </button>
          </div>
        </div>

        {/* PRICING */}
        <div className="p-4 rounded-2xl shadow-sm border">
          <h3 className="font-semibold">Pricing</h3>
          <ul className="mt-2 text-sm space-y-1">
            <li>Box scan: ₹{billingConfig.pricing.scan.box}/scan</li>
            <li>Carton scan: ₹{billingConfig.pricing.scan.carton}/scan</li>
            <li>Pallet scan: ₹{billingConfig.pricing.scan.pallet}/scan</li>
            <li>Box SSCC gen: ₹{billingConfig.pricing.generation.boxSSCC}/code</li>
            <li>
              Carton SSCC gen: ₹
              {billingConfig.pricing.generation.cartonSSCC}/code
            </li>
            <li>
              Pallet SSCC gen: ₹
              {billingConfig.pricing.generation.palletSSCC}/code
            </li>
            <li>
              Handset activation: ₹
              {billingConfig.pricing.device.handsetActivationPerMonth}/month
            </li>
            <li>
              Seat allocation: ₹
              {billingConfig.pricing.seat.seatAllocationPerMonth}/month
            </li>
          </ul>
        </div>
      </div>

      {/* ACTIVE HEADS */}
      <div className="mb-6 p-4 rounded-2xl shadow-sm border">
        <h3 className="font-semibold">Active Heads</h3>

        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          {Object.keys(activeHeads).map((key) => (
            <div
              key={key}
              className="flex items-center justify-between p-2 border rounded-xl"
            >
              <div className="capitalize pr-2">
                {key.replace(/([A-Z])/g, " $1")}
              </div>

              <div className="flex gap-2 items-center">
                <div className="text-sm">{activeHeads[key] ? "ON" : "OFF"}</div>
                <button
                  className="px-2 py-1 rounded bg-gray-100"
                  onClick={() => toggleHead(key)}
                  disabled={loading}
                >
                  Toggle
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
