"use client";
import React, { useEffect, useState } from "react";

type Unit = { uid: string; status?: string; created_at?: string };
type Box = { sscc: string; status?: string; created_at?: string; units?: Unit[] };
type Carton = { sscc: string; status?: string; created_at?: string; boxes?: Box[] };
type Pallet = { sscc: string; status?: string; created_at?: string; cartons?: Carton[] };

export default function ContainerTree({ companyId }: { companyId?: string }) {
  const [rootList, setRootList] = useState<Pallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [node, setNode] = useState<any | null>(null);

  useEffect(() => {
    if (companyId) loadPallets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function loadPallets() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/pallet?company_id=${companyId}`);
      const json = await res.json();
      setRootList(json.pallets ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function searchCode(code: string) {
    if (!code) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?code=${encodeURIComponent(code)}&company_id=${encodeURIComponent(
          companyId ?? ""
        )}`
      );
      const json = await res.json();
      if (json.error) {
        setNode({ error: json.error });
      } else {
        setNode(json);
      }
    } catch (e) {
      setNode({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  function renderUnit(u: Unit) {
    return (
      <div className="pl-8 py-1 text-sm border-b" key={u.uid}>
        <div className="font-mono">{u.uid}</div>
        <div className="text-xs text-gray-500">{u.status ?? "—"} • {u.created_at ? new Date(u.created_at).toLocaleString() : ""}</div>
      </div>
    );
  }

  function renderBox(b: Box) {
    return (
      <div key={b.sscc} className="pl-4 border-l">
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="font-medium">{b.sscc}</div>
            <div className="text-xs text-gray-500">{b.status ?? "—"}</div>
          </div>
          <div className="text-xs text-gray-500">{b.created_at ? new Date(b.created_at).toLocaleString() : ""}</div>
        </div>
        <div className="space-y-1">{(b.units || []).map(renderUnit)}</div>
      </div>
    );
  }

  function renderCarton(c: Carton) {
    return (
      <div key={c.sscc} className="pl-2 border-l">
        <div className="flex items-center justify-between py-3 bg-gray-50 rounded px-2">
          <div>
            <div className="font-semibold">{c.sscc}</div>
            <div className="text-xs text-gray-500">{c.status ?? "—"}</div>
          </div>
          <div className="text-xs text-gray-500">{c.created_at ? new Date(c.created_at).toLocaleString() : ""}</div>
        </div>
        <div className="mt-2 space-y-2">{(c.boxes || []).map(renderBox)}</div>
      </div>
    );
  }

  function renderPallet(p: Pallet) {
    return (
      <div key={p.sscc} className="p-3 border rounded mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold">{p.sscc}</div>
            <div className="text-xs text-gray-500">{p.status ?? "—"}</div>
          </div>
          <div className="text-xs text-gray-500">{p.created_at ? new Date(p.created_at).toLocaleString() : ""}</div>
        </div>
        <div className="mt-3 space-y-3">{(p.cartons || []).map(renderCarton)}</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Container Aggregation</h2>
        <div className="flex gap-2">
          <input
            className="px-3 py-2 border rounded w-96"
            placeholder="Search by SSCC / UID (e.g. scan result)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="px-3 py-2 border rounded" onClick={() => searchCode(query)} disabled={!query || loading}>
            Search
          </button>
          <button className="px-3 py-2 border rounded" onClick={() => { setQuery(""); setNode(null); }}>
            Clear
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="mb-3 text-sm text-gray-600">Click a pallet to load its full hierarchy (or use search)</div>

          {node ? (
            <div className="p-4 border rounded">
              <div className="mb-2 font-semibold">Search Result: {node.type ?? "—"}</div>
              <pre className="text-xs overflow-auto p-2 bg-black/5 rounded">{JSON.stringify(node.data ?? node, null, 2)}</pre>
            </div>
          ) : (
            <div>
              {loading && <div className="mb-3">Loading…</div>}
              {(rootList || []).length === 0 && <div className="text-sm text-gray-500">No pallets found</div>}
              <div className="space-y-3">{rootList.map(renderPallet)}</div>
            </div>
          )}
        </div>

        <aside className="p-4 border rounded">
          <div className="font-semibold mb-2">Quick actions</div>
          <button className="w-full px-3 py-2 rounded border mb-2" onClick={() => loadPallets()} disabled={loading}>
            Refresh Pallets
          </button>
          <div className="text-sm text-gray-500 mt-3">Tip: use the scanner to copy code and paste into search to load a single node.</div>
        </aside>
      </div>
    </div>
  );
}
