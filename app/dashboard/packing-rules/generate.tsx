"use client";

import { useState } from "react";

export default function GenerateHierarchy() {
  const [companyId, setCompanyId] = useState("00000000-0000-0000-0000-000000000001");
  const [skuId, setSkuId] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [totalStrips, setTotalStrips] = useState("");
  const [requestId, setRequestId] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function runGenerate() {
    setError(null);
    setResult(null);

    if (!companyId || !skuId || !ruleId || !totalStrips) {
      setError("company_id, sku_id, packing_rule_id and total_strips are required");
      return;
    }

    setRunning(true);
    try {
      const res = await fetch("/api/generate/hierarchy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          sku_id: skuId,
          packing_rule_id: ruleId,
          total_strips: Number(totalStrips),
          request_id: requestId || `job-${Date.now()}`,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(JSON.stringify(body));
      } else {
        setResult(body);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <h3>Generate Hierarchy (Boxes → Cartons → Pallets)</h3>

      <label>Company ID</label>
      <input value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ display: "block", marginBottom: 8, width: "100%" }} />

      <label>SKU ID</label>
      <input value={skuId} onChange={e => setSkuId(e.target.value)} style={{ display: "block", marginBottom: 8, width: "100%" }} />

      <label>Packing Rule ID</label>
      <input value={ruleId} onChange={e => setRuleId(e.target.value)} style={{ display: "block", marginBottom: 8, width: "100%" }} />

      <label>Total Strips (integer)</label>
      <input value={totalStrips} onChange={e => setTotalStrips(e.target.value)} style={{ display: "block", marginBottom: 8, width: "100%" }} />

      <label>Request ID (optional)</label>
      <input value={requestId} onChange={e => setRequestId(e.target.value)} placeholder="leave empty for auto" style={{ display: "block", marginBottom: 12, width: "100%" }} />

      <button onClick={runGenerate} disabled={running} style={{ padding: "8px 16px" }}>
        {running ? "Generating…" : "Generate Hierarchy"}
      </button>

      {error && (
        <div style={{ marginTop: 12, color: "crimson", whiteSpace: "pre-wrap" }}>
          <strong>Error:</strong>
          <div>{error}</div>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12, background: "#f6f8fa", padding: 12 }}>
          <h4>Generation Result</h4>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
