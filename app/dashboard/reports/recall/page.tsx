"use client";

import { useMemo, useState } from "react";

export default function Page() {
  const [batch, setBatch] = useState<string>("");
  const [sku, setSku] = useState<string>("");
  const [gtin, setGtin] = useState<string>("");
  const [pallet, setPallet] = useState<string>("");

  const hasAnyFilter = Boolean(batch || sku || gtin || pallet);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (batch) params.set("batch", batch);
    if (sku) params.set("sku", sku);
    if (gtin) params.set("gtin", gtin);
    if (pallet) params.set("pallet", pallet);
    const qs = params.toString();
    return qs ? `/api/reports/recall?${qs}` : "/api/reports/recall";
  }, [batch, sku, gtin, pallet]);

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <h1 className="text-3xl font-semibold mb-4">
        Recall Impact Report
      </h1>

      <p className="text-gray-500 mb-6">
        Identify all affected units and containers for recall execution.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="label">Batch</label>
          <input
            className="input"
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            placeholder="e.g. BATCH123"
          />
        </div>
        <div>
          <label className="label">SKU</label>
          <input
            className="input"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g. SKU-001"
          />
        </div>
        <div>
          <label className="label">GTIN</label>
          <input
            className="input"
            value={gtin}
            onChange={(e) => setGtin(e.target.value)}
            placeholder="e.g. 0890..."
          />
        </div>
        <div>
          <label className="label">Pallet (SSCC)</label>
          <input
            className="input"
            value={pallet}
            onChange={(e) => setPallet(e.target.value)}
            placeholder="SSCC"
          />
        </div>
      </div>

      <a
        href={hasAnyFilter ? exportHref : "#"}
        className={`btn-primary ${hasAnyFilter ? "" : "opacity-60 pointer-events-none"}`}
      >
        Export Recall CSV
      </a>

      {!hasAnyFilter && (
        <p className="text-sm text-gray-500 mt-3">
          Enter at least one field (batch, sku, gtin, or pallet).
        </p>
      )}
    </div>
  );
}
