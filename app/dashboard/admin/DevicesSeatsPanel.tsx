"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

type HandsetToken = {
  id: string;
  token: string;
  used: boolean;
  created_at: string;
};

export default function DevicesSeatsPanel({ companyId }: { companyId: string }) {
  const [handsets, setHandsets] = useState<Handset[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [tokens, setTokens] = useState<HandsetToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [newSeatId, setNewSeatId] = useState("");
  const [generatedToken, setGeneratedToken] = useState("");

  async function fetchAll() {
    setLoading(true);
    try {
      const [hRes, sRes, tRes] = await Promise.all([
        fetch(`/api/admin/handsets?company_id=${companyId}`),
        fetch(`/api/admin/seats?company_id=${companyId}`),
        fetch(`/api/admin/handset-tokens?company_id=${companyId}`),
      ]);
      const hJson = await hRes.json();
      const sJson = await sRes.json();
      const tJson = await tRes.json();
      setHandsets(hJson.handsets ?? []);
      setSeats(sJson.seats ?? []);
      setTokens(tJson.tokens ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function generateToken() {
    setLoading(true);
    setGeneratedToken("");
    try {
      const res = await fetch("/api/handset/generate-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const data = await res.json();
      if (data.token) {
        setGeneratedToken(data.token);
        await fetchAll();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function addNewSeat() {
    if (!newSeatId.trim()) return;
    setLoading(true);
    try {
      await fetch("/api/seat/allocate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, seat_id: newSeatId.trim() }),
      });
      setNewSeatId("");
      await fetchAll();
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
    <div className="p-6 max-w-7xl space-y-6">
      <h2 className="text-2xl font-semibold">Devices & Seats Management</h2>

      {/* Token Generation Section */}
      <Card>
        <CardHeader>
          <CardTitle>Handset Activation Tokens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={generateToken} disabled={loading}>
              Generate New Token
            </Button>
          </div>
          
          {generatedToken && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-900 mb-2">New Token Generated:</p>
              <code className="text-lg font-mono text-green-700 bg-white px-3 py-2 rounded block">{generatedToken}</code>
              <p className="text-xs text-green-600 mt-2">Share this token with the user to activate their handset.</p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="font-medium text-sm">Recent Tokens</h4>
            {tokens.length === 0 && <p className="text-sm text-muted-foreground">No tokens generated yet</p>}
            {tokens.slice(0, 10).map((t) => (
              <div key={t.id} className="flex items-center justify-between p-2 border rounded">
                <code className="text-sm font-mono">{t.token}</code>
                <Badge variant={t.used ? "secondary" : "default"}>
                  {t.used ? "Used" : "Available"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Handsets Section */}
        <Card>
          <CardHeader>
            <CardTitle>Active Handsets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {handsets.length === 0 && <p className="text-sm text-muted-foreground">No handsets activated</p>}
              {handsets.map((h) => (
                <div key={h.handset_id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium">{h.handset_id}</div>
                    <div className="text-xs text-gray-500">₹{h.monthly_fee}/month</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={h.active ? "default" : "secondary"}>
                      {h.active ? "Active" : "Inactive"}
                    </Badge>
                    {h.active && (
                      <Button variant="outline" size="sm" onClick={() => deactivateHandset(h.handset_id)} disabled={loading}>
                        Deactivate
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Seats Section */}
        <Card>
          <CardHeader>
            <CardTitle>Seat Allocations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter Seat ID"
                  value={newSeatId}
                  onChange={(e) => setNewSeatId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addNewSeat()}
                />
                <Button onClick={addNewSeat} disabled={loading || !newSeatId.trim()}>
                  Allocate
                </Button>
              </div>

              <div className="space-y-2">
                {seats.length === 0 && <p className="text-sm text-muted-foreground">No seats allocated</p>}
                {seats.map((s) => (
                  <div key={s.seat_id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <div className="font-medium">{s.seat_id}</div>
                      <div className="text-xs text-gray-500">₹{s.monthly_fee}/month</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.active ? "default" : "secondary"}>
                        {s.active ? "Active" : "Inactive"}
                      </Badge>
                      {s.active ? (
                        <Button variant="outline" size="sm" onClick={() => deactivateSeat(s.seat_id)} disabled={loading}>
                          Deactivate
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => allocateSeat(s.seat_id)} disabled={loading}>
                          Activate
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
