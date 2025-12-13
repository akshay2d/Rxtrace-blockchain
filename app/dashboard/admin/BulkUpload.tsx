"use client";
import React, { useState } from "react";

export default function BulkUpload({ companyId }: { companyId: string }) {
  const [csvText, setCsvText] = useState("");
  const [level, setLevel] = useState<"pallet"|"carton"|"box"|"unit">("pallet");
  const [parentColumn, setParentColumn] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function submit() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/bulk-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, level, csv: csvText, parent_column: parentColumn || undefined }),
      });
      const json = await res.json();
      setResult(json);
    } catch (e) {
      setResult({ success: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  const sample = level === "carton"
    ? "carton_code,pallet_sscc\nA001,\nA002,SSCC000000000000001"
    : level === "box"
    ? "box_code,carton_sscc\nB001,\nB002,SSCC000000000000002"
    : "value\nrow1\nrow2";

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-2xl mb-4">Bulk Upload - Generate {level.toUpperCase()}</h2>

      <div className="mb-3">
        <label className="block text-sm">Level</label>
        <select value={level} onChange={(e) => setLevel(e.target.value as any)} className="px-3 py-2 border rounded">
          <option value="pallet">Pallet (SSCC)</option>
          <option value="carton">Carton (SSCC)</option>
          <option value="box">Box (SSCC)</option>
          <option value="unit">Unit (UID)</option>
        </select>
      </div>

      <div className="mb-3">
        <label className="block text-sm">Parent column (optional)</label>
        <input placeholder="e.g. pallet_sscc" value={parentColumn} onChange={(e)=>setParentColumn(e.target.value)} className="px-3 py-2 border rounded w-72" />
        <div className="text-xs text-gray-500 mt-1">If your CSV has a header with parent column names, provide the column name here.</div>
      </div>

      <div className="mb-3">
        <label className="block text-sm">CSV (paste)</label>
        <textarea rows={8} value={csvText} onChange={(e)=>setCsvText(e.target.value)} className="w-full p-2 border rounded" />
        <div className="mt-2 text-xs text-gray-500">Sample:</div>
        <pre className="text-xs p-2 bg-black/5 rounded">{sample}</pre>
      </div>

      <div className="flex gap-2">
        <button className="px-3 py-2 border rounded" onClick={submit} disabled={loading}>Generate</button>
        <button className="px-3 py-2 border rounded" onClick={()=>setCsvText(sample)}>Load sample</button>
      </div>

      <div className="mt-4">
        <pre className="text-xs">{JSON.stringify(result, null, 2)}</pre>
      </div>
    </div>
  );
}
