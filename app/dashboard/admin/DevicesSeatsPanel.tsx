"use client";
import React, { useEffect, useState } from "react";

type Handset = {
  id: string;
  handset_id: string;
  company_id: string;
  active: boolean;
  activated_at: string | null;
  deactivated_at: string | null;
  monthly_fee: number;
};

type Seat = {
  id: string;
  seat_id: string;
  company_id: string;
  active: boolean;
  activated_at: string | null;
  deactivated_at: string | null;
  monthly_fee: number;
};

export default function DevicesSeatsPanel({ companyId }: { companyId: string }) {
  const [handsets, setHandsets] = useState<Handset[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchAll() {
    setLoading(true);
    try {
      const [hRes, sRes] = await Promise.all([
        fetch(`/api/admin/handsets?company_id=${companyId}`),
        fetch(`/api/admin/seats?company_id=${companyId}`),
      ]);
      const hJson = await hRes.json();
      const sJson = await sRes.json();
      setHandsets(hJson.handsets ?? []);
      setSeats(sJson.seats ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (companyId) fetchAll();
  }, [companyId]);

  async function activateHandset(handsetId: string) {
    setLoading(true);
    try {
      await fetch("/api/handset/activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, handset_id: handsetId }),
      });
      await fetchAll();
    } finally {
      setLoading(false);
    }
  }

  async function deactivateHandset(handsetId: string) {
    setLoading(true);
    try {
      await fetch("/api/handset/deactivate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handset_id: handsetId }),
      });
      await fetchAll();
    } finally {
      setLoading(false);
    }
  }

  async function allocateSeat(seatId: string) {
    setLoading(true);
    try {
      await fetch("/api/seat/allocate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, seat_id: seatId }),
      });
      await fetchAll();
    } finally {
      setLoading(false);
    }
  }

  async function deactivateSeat(seatId: string) {
    setLoading(true);
    try {
      await fetch("/api/seat/deactivate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seat_id: seatId }),
      });
      await fetchAll();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl">
      <h2 className="text-2xl font-semibold mb-4">Handsets & Seats</h2>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="p-4 border rounded-2xl">
          <h3 className="font-semibold mb-3">Handsets</h3>
          {loading ? <div>Loading…</div> : null}
          <div className="space-y-2">
            {handsets.length === 0 && <div className="text-sm text-muted-foreground">No handsets</div>}
            {handsets.map((h) => (
              <div key={h.handset_id} className="flex items-center justify-between p-2 border rounded">
                <div>
                  <div className="font-medium">{h.handset_id}</div>
                  <div className="text-xs text-gray-500">Fee ₹{h.monthly_fee}/mo • {h.active ? "Active" : "Inactive"}</div>
                </div>
                <div className="flex gap-2">
                  {h.active ? (
                    <button className="px-3 py-1 rounded border" onClick={() => deactivateHandset(h.handset_id)} disabled={loading}>Deactivate</button>
                  ) : (
                    <button className="px-3 py-1 rounded border" onClick={() => activateHandset(h.handset_id)} disabled={loading}>Activate</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="p-4 border rounded-2xl">
          <h3 className="font-semibold mb-3">Seats</h3>
          {loading ? <div>Loading…</div> : null}
          <div className="space-y-2">
            {seats.length === 0 && <div className="text-sm text-muted-foreground">No seats allocated</div>}
            {seats.map((s) => (
              <div key={s.seat_id} className="flex items-center justify-between p-2 border rounded">
                <div>
                  <div className="font-medium">{s.seat_id}</div>
                  <div className="text-xs text-gray-500">Fee ₹{s.monthly_fee}/mo • {s.active ? "Active" : "Inactive"}</div>
                </div>
                <div className="flex gap-2">
                  {s.active ? (
                    <button className="px-3 py-1 rounded border" onClick={() => deactivateSeat(s.seat_id)} disabled={loading}>Deactivate</button>
                  ) : (
                    <button className="px-3 py-1 rounded border" onClick={() => allocateSeat(s.seat_id)} disabled={loading}>Allocate</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
