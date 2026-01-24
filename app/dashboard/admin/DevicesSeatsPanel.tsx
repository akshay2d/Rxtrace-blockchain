"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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

type HandsetToken = {
  id: string;
  token: string;
  used: boolean;
  created_at: string;
};

export default function HandsetManagementPanel({ companyId }: { companyId: string }) {
  const [handsets, setHandsets] = useState<Handset[]>([]);
  const [tokens, setTokens] = useState<HandsetToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatedToken, setGeneratedToken] = useState("");
  const [error, setError] = useState("");

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [hRes, tRes] = await Promise.all([
        fetch(`/api/admin/handsets?company_id=${companyId}`),
        fetch(`/api/admin/handset-tokens?company_id=${companyId}`),
      ]);
      
      const hJson = await hRes.json();
      const tJson = await tRes.json();
      
      setHandsets(hJson.handsets ?? []);
      setTokens(tJson.tokens ?? []);
    } catch (err) {
      console.error(err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

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

  useEffect(() => {
    if (companyId) fetchAll();
  }, [companyId, fetchAll]);

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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Handset Management</h2>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* SSCC Scanner Activation Info */}
      <Card>
        <CardHeader>
          <CardTitle>SSCC Scanner Activation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 mb-3">
              Handsets now activate directly from the mobile app using company ID. 
              No token generation required.
            </p>
            <div className="text-xs text-blue-800 space-y-1">
              <p className="font-medium mb-2">How it works:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>User opens mobile scanner app</li>
                <li>Enters company ID to activate</li>
                <li>App receives JWT token automatically</li>
                <li>Ready to scan SSCC codes (boxes, cartons, pallets)</li>
              </ul>
            </div>
          </div>

          {/* Legacy Tokens (if any exist) */}
          {tokens.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <h4 className="font-medium text-sm text-amber-700">Legacy Tokens (Old System)</h4>
              <p className="text-xs text-amber-600 mb-2">These tokens are from the old activation system. New handsets use company ID activation.</p>
              {tokens.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between p-2 border border-amber-200 bg-amber-50 rounded">
                  <code className="text-sm font-mono text-amber-800">{t.token}</code>
                  <Badge variant={t.used ? "secondary" : "default"}>
                    {t.used ? "Used" : "Available"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Handsets Section */}
      <Card>
        <CardHeader>
          <CardTitle>Active Handsets ({handsets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {handsets.length === 0 && <p className="text-sm text-muted-foreground">No handsets activated</p>}
            {handsets.map((h) => (
              <div key={h.handset_id} className="flex items-center justify-between p-3 border rounded">
                <div>
                  <div className="font-medium">{h.handset_id}</div>
                  <div className="text-xs text-gray-500">₹{h.monthly_fee}/month</div>
                  {h.activated_at && (
                    <div className="text-xs text-gray-400 mt-1">
                      Activated: {new Date(h.activated_at).toLocaleDateString()}
                    </div>
                  )}
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
    </div>
  );
}
