"use client";

import { useEffect, useMemo, useState } from "react";

export default function Page() {
  const [logs, setLogs] = useState<any[]>([]);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const actionOptions = useMemo(
    () => [
      { value: "", label: "All actions" },
      { value: "reports.usage.export", label: "Usage Report – Export" },
      { value: "reports.trace.export", label: "Traceability Report – Export" },
      { value: "reports.recall.export", label: "Recall Report – Export" },
    ],
    []
  );

  const actionLabelByValue = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of actionOptions) {
      if (opt.value) map.set(opt.value, opt.label);
    }
    return map;
  }, [actionOptions]);

  const logsHref = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (action) params.set("action", action);
    if (status) params.set("status", status);
    const qs = params.toString();
    return qs ? `/api/audit/logs?${qs}` : "/api/audit/logs";
  }, [from, to, action, status]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("type", "audit");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (action) params.set("action", action);
    if (status) params.set("status", status);
    return `/api/audit/export?${params.toString()}`;
  }, [from, to, action, status]);

  async function fetchLogs() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(logsHref);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setLogs([]);
        setError(body?.error || "Failed to load audit logs");
        return;
      }
      setLogs(Array.isArray(body) ? body : []);
    } catch (e: any) {
      setLogs([]);
      setError(e?.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <h1 className="text-3xl font-semibold mb-4">Audit Logs</h1>
      <p className="text-gray-500 mb-6">
        View and export your company’s audit trail.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="label">From</label>
          <input
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>

        <div>
          <label className="label">To</label>
          <input
            type="date"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Report</label>
          <select
            className="input"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            {actionOptions.map((opt) => (
              <option key={opt.value || "__all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Status</label>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <button
          type="button"
          className="btn-primary"
          onClick={fetchLogs}
          disabled={loading}
        >
          {loading ? "Loading…" : "Load"}
        </button>

        <a href={exportHref} className="btn-primary">
          Export CSV
        </a>
      </div>

      {error ? (
        <div className="mb-4 text-sm text-red-600">{error}</div>
      ) : null}

      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-2 p-3 border-b text-xs font-medium text-gray-500">
          <div className="col-span-3">Date</div>
          <div className="col-span-2">Actor</div>
          <div className="col-span-4">Action</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2">Integration</div>
        </div>

        {logs.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">
            No audit logs found.
          </div>
        ) : (
          logs.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-12 gap-2 p-3 border-b text-sm"
            >
              <div className="col-span-3 truncate" title={l.created_at}>
                {l.created_at}
              </div>
              <div className="col-span-2 truncate" title={l.actor}>
                {l.actor || ""}
              </div>
              <div className="col-span-4 truncate" title={l.action}>
                {actionLabelByValue.get(l.action) ? (
                  <span>
                    {actionLabelByValue.get(l.action)}
                    <span className="text-gray-500"> ({l.action})</span>
                  </span>
                ) : (
                  l.action
                )}
              </div>
              <div className="col-span-1 truncate" title={l.status}>
                {l.status}
              </div>
              <div
                className="col-span-2 truncate"
                title={l.integration_system || ""}
              >
                {l.integration_system || ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
