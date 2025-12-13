"use client";
import React, { useEffect, useRef, useState } from "react";

type ScanEvent = {
  id: string;
  company_id?: string;
  type?: string;
  subtype?: string | null;
  count?: number;
  amount?: number;
  balance_after?: number | null;
  created_at?: string;
  [k: string]: any;
};

export default function ScanDashboard({ companyId }: { companyId?: string }) {
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // load history once
    fetchHistory();
    // connect SSE
    connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function fetchHistory() {
    try {
      const url = `/api/admin/scan-history?limit=100${companyId ? `&company_id=${companyId}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setEvents(json.events);
      }
    } catch (e) {
      console.error("history fetch", e);
    }
  }

  function connect() {
    if (esRef.current) return;
    const url = `/api/events/scan-stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };
    es.onerror = (e) => {
      // try reconnect
      console.warn("SSE error", e);
      setConnected(false);
      // close and attempt reconnect after delay
      disconnect();
      setTimeout(() => connect(), 3000);
    };

    es.addEventListener("scan", (ev: any) => {
      if (paused) return;
      try {
        const data: ScanEvent = JSON.parse(ev.data);
        if (companyId && data.company_id !== companyId) return;
        setEvents((s) => [data, ...s].slice(0, 500));
      } catch (e) {
        console.error("parse scan event", e);
      }
    });

    es.addEventListener("open", (ev: any) => {
      // optional
    });

    es.addEventListener("error", (ev: any) => {
      console.warn("SSE error event", ev);
    });
  }

  function disconnect() {
    if (!esRef.current) return;
    try {
      esRef.current.close();
    } catch (e) {}
    esRef.current = null;
    setConnected(false);
  }

  function clearEvents() {
    setEvents([]);
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Live Scan Dashboard</h2>
        <div className="flex gap-2">
          <div className="text-sm">Status: {connected ? "connected" : "disconnected"}</div>
          <button
            className="px-3 py-1 rounded border"
            onClick={() => {
              if (esRef.current) {
                disconnect();
              } else {
                connect();
              }
            }}
          >
            {esRef.current ? "Disconnect" : "Connect"}
          </button>
          <button className="px-3 py-1 rounded border" onClick={() => setPaused((p) => !p)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button className="px-3 py-1 rounded border" onClick={clearEvents}>
            Clear
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input
          placeholder="Filter by company_id"
          value={companyId ?? ""}
          readOnly
          className="px-3 py-2 border rounded w-full max-w-md text-sm"
        />
      </div>

      <div className="space-y-2">
        {events.length === 0 && <div className="text-sm text-gray-500">No events yet</div>}
        {events.map((e) => (
          <div key={e.id} className="p-3 border rounded grid grid-cols-6 gap-2 items-center">
            <div className="col-span-1 text-xs text-gray-500">{new Date(e.created_at || "").toLocaleString()}</div>
            <div className="col-span-1 font-mono text-sm break-words">{e.company_id ?? "—"}</div>
            <div className="col-span-1 text-sm">{e.subtype ?? e.type}</div>
            <div className="col-span-1 text-sm">₹{(e.amount ?? 0).toFixed(2)}</div>
            <div className="col-span-2 text-sm break-words">{JSON.stringify(e, null, 0).slice(0, 200)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
