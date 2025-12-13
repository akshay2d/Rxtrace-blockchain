"use client";

import { useState } from "react";

export default function PackingRulesPage() {
  const [sku, setSku] = useState("");

  const [strips, setStrips] = useState("");
  const [boxes, setBoxes] = useState("");
  const [cartons, setCartons] = useState("");

  const [extDigit, setExtDigit] = useState("0");
  const [prefix, setPrefix] = useState("");

  const [previewQty, setPreviewQty] = useState("");
  const [previewResult, setPreviewResult] = useState(null);
  const [saveResult, setSaveResult] = useState(null);

  // -------------------------
  // SAVE RULE (Step 2)
  // -------------------------
  async function saveRule() {
    const res = await fetch("/api/packing-rules", {
      method: "POST",
      body: JSON.stringify({
        sku_id: sku,
        strips_per_box: Number(strips),
        boxes_per_carton: Number(boxes),
        cartons_per_pallet: Number(cartons),
        sscc_extension_digit: Math.floor(Math.random() * 10), // Auto-generate 0-9
        sscc_company_prefix: prefix
      })
    });

    const out = await res.json();
    setSaveResult(out);
  }

  // -------------------------
  // PREVIEW (Step 3)
  // -------------------------
  async function previewCalc() {
    const res = await fetch("/api/packing-rules/preview", {
      method: "POST",
      body: JSON.stringify({
        sku_id: sku,
        total_strips: Number(previewQty)
      })
    });

    const out = await res.json();
    setPreviewResult(out);
  }

  // -------------------------
  // UI RENDER
  // -------------------------
  return (
    <div style={{ padding: 20, maxWidth: 500 }}>
      <h2>Packing Rules Setup</h2>

      <label>SKU ID</label>
      <input
        value={sku}
        onChange={e => setSku(e.target.value)}
        placeholder="Enter SKU ID"
        style={{ display: "block", marginBottom: 10 }}
      />

      <label>Strips per Box</label>
      <input
        value={strips}
        onChange={e => setStrips(e.target.value)}
        placeholder="10"
        style={{ display: "block", marginBottom: 10 }}
      />

      <label>Boxes per Carton</label>
      <input
        value={boxes}
        onChange={e => setBoxes(e.target.value)}
        placeholder="100"
        style={{ display: "block", marginBottom: 10 }}
      />

      <label>Cartons per Pallet</label>
      <input
        value={cartons}
        onChange={e => setCartons(e.target.value)}
        placeholder="100"
        style={{ display: "block", marginBottom: 10 }}
      />

      <label>GS1 Company Prefix</label>
      <input
        value={prefix}
        onChange={e => setPrefix(e.target.value)}
        placeholder="8901234"
        style={{ display: "block", marginBottom: 20 }}
      />

      <button onClick={saveRule} style={{ marginBottom: 20 }}>
        Save Packing Rule
      </button>

      {saveResult && (
        <pre style={{ background: "#eee", padding: 10 }}>
          {JSON.stringify(saveResult, null, 2)}
        </pre>
      )}

      {/* ---------------- Preview section ---------------- */}
      <h3>Preview Packaging Output</h3>

      <label>Total Strips</label>
      <input
        value={previewQty}
        onChange={e => setPreviewQty(e.target.value)}
        placeholder="Enter strips quantity"
        style={{ display: "block", marginBottom: 10 }}
      />

      <button onClick={previewCalc}>Preview</button>

      {previewResult && (
        <pre style={{ background: "#eee", padding: 10, marginTop: 10 }}>
          {JSON.stringify(previewResult, null, 2)}
        </pre>
      )}
    </div>
  );
}
