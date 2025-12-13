"use client";

import { useState } from "react";

export default function BillingPage() {
  const [companyId, setCompanyId] = useState("00000000-0000-0000-0000-000000000001");
  const [wallet, setWallet] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [opAmount, setOpAmount] = useState("");
  const [opType, setOpType] = useState<"CHARGE" | "TOPUP">("CHARGE");
  const [ref, setRef] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function fetchWallet() {
    setLoading(true);
    setMsg(null);
    setWallet(null);
    try {
      const res = await fetch(`/api/billing/wallet?company_id=${encodeURIComponent(companyId)}`);
      const body = await res.json();
      if (!res.ok) setMsg(JSON.stringify(body));
      else setWallet(body);
    } catch (e: any) {
      setMsg(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function applyOp() {
    setMsg(null);
    if (!companyId || !opAmount || Number(opAmount) <= 0) {
      setMsg("company_id and positive amount required");
      return;
    }
    try {
      const res = await fetch("/api/billing/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          op: opType,
          amount: Number(opAmount),
          reference: ref || null,
          created_by: null
        })
      });
      const body = await res.json();
      if (!res.ok) setMsg(JSON.stringify(body));
      else {
        setMsg("Operation successful");
        // show returned result
        setWallet(body.result ?? body);
      }
    } catch (e: any) {
      setMsg(String(e));
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 760 }}>
      <h2>Billing — Wallet</h2>

      <div style={{ marginBottom: 12 }}>
        <label>Company ID</label>
        <input value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ width: "100%", marginTop: 6 }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <button onClick={fetchWallet} disabled={loading} style={{ padding: "8px 12px" }}>
          {loading ? "Loading…" : "Refresh Wallet"}
        </button>
      </div>

      {msg && <div style={{ color: "crimson", marginBottom: 12, whiteSpace: "pre-wrap" }}>{msg}</div>}

      {wallet && (
        <div style={{ border: "1px solid #e6e6e6", padding: 12, marginBottom: 12 }}>
          <div><strong>Company:</strong> {wallet.company_id}</div>
          <div><strong>Balance:</strong> ₹{Number(wallet.balance).toFixed(2)}</div>
          <div><strong>Credit limit:</strong> ₹{Number(wallet.credit_limit).toFixed(2)}</div>
          <div><strong>Status:</strong> {wallet.status}</div>
          <div><strong>Updated:</strong> {new Date(wallet.updated_at).toLocaleString()}</div>
        </div>
      )}

      <h3>Apply Charge / Top-up</h3>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select value={opType} onChange={e => setOpType(e.target.value as any)}>
          <option value="CHARGE">CHARGE (deduct)</option>
          <option value="TOPUP">TOPUP (add)</option>
        </select>

        <input
          placeholder="Amount (e.g. 1500)"
          value={opAmount}
          onChange={e => setOpAmount(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <input placeholder="Reference (optional)" value={ref} onChange={e => setRef(e.target.value)} style={{ width: "100%" }} />
      </div>

      <div>
        <button onClick={applyOp} style={{ padding: "8px 14px" }}>Apply</button>
      </div>

      <div style={{ marginTop: 16, color: "#666" }}>
        Note: charges set wallet status to FROZEN if balance {"<="} 0. Use TOPUP to add funds.
      </div>
    </div>
  );
}
