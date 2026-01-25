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
