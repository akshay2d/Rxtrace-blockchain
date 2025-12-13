"use client";

import { useEffect, useState } from "react";

type Props = { companyId: string };

export default function CreditStatus({ companyId }: Props) {
  const [data, setData] = useState<null | {
    balance: number;
    credit_limit: number;
    available_credit: number;
    status: string;
    freeze: boolean;
    updated_at: string | null;
  }>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/billing/credit?company_id=${encodeURIComponent(companyId)}`);
        const body = await res.json();
        if (!res.ok) setErr(JSON.stringify(body));
        else setData(body);
      } catch (e: any) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  if (loading) return <div>Loading credit status…</div>;
  if (err) return <div style={{ color: "crimson" }}>{err}</div>;
  if (!data) return null;

  return (
    <div style={{ border: "1px solid #e6e6e6", padding: 12, marginBottom: 12, background: data.freeze ? "#fff6f6" : "#fbfffb" }}>
      {data.freeze ? (
        <div style={{ color: "#7a1414", marginBottom: 8 }}>
          <strong>Account frozen:</strong> your wallet is frozen due to insufficient credit. Available credit: ₹{data.available_credit.toFixed(2)}.
        </div>
      ) : (
        <div style={{ color: "#114a14", marginBottom: 8 }}>
          <strong>Available credit:</strong> ₹{data.available_credit.toFixed(2)} (Balance: ₹{data.balance.toFixed(2)} + Limit: ₹{data.credit_limit.toFixed(2)})
        </div>
      )}
      <div style={{ fontSize: 12, color: "#666" }}>
        Status: {data.status} • Last updated: {data.updated_at ? new Date(data.updated_at).toLocaleString() : "n/a"}
      </div>
    </div>
  );
}
