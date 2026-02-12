"use client";

import { useMemo, useState } from "react";

export default function Page() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return qs ? `/api/reports/billing?${qs}` : "/api/reports/billing";
  }, [from, to]);

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <h1 className="text-3xl font-semibold mb-4">
        Pilot Usage Report
      </h1>

      <p className="text-gray-500 mb-6">
        Download pilot usage summary.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
      </div>

      <a href={exportHref} className="btn-primary">
        Export Usage CSV
      </a>
    </div>
  );
}
