"use client";

import { useMemo, useState } from "react";

export default function Page() {
  const [code, setCode] = useState("");
  const [codeType, setCodeType] = useState<
    "AUTO" | "UNIT" | "BOX" | "CARTON" | "PALLET"
  >("AUTO");
  const [error, setError] = useState<string>("");
  const [downloading, setDownloading] = useState<null | "csv" | "pdf">(null);

  const trimmed = code.trim();
  const hasCode = Boolean(trimmed);

  const encoded = useMemo(() => encodeURIComponent(trimmed), [trimmed]);

  function toFriendlyError(status: number, body: any): string {
    const raw =
      typeof body?.error === "string"
        ? body.error
        : typeof body?.message === "string"
          ? body.message
          : "";

    // Common API messages → user-friendly copy
    if (/code and format are required/i.test(raw)) return "Please enter a code.";
    if (/invalid format/i.test(raw)) return "Please choose CSV or PDF export.";
    if (/not authenticated/i.test(raw)) return "Please sign in and try again.";
    if (/company not found/i.test(raw)) return "Company setup is missing for your account.";

    if (status === 404) return "No results found for this code.";
    if (status === 400) return raw || "Please enter a valid code.";
    if (status >= 500) return "Something went wrong while generating the report.";

    return raw || "Failed to generate the report.";
  }

  async function download(format: "csv" | "pdf") {
    setError("");

    if (!trimmed) {
      setError("Please enter a code.");
      return;
    }

    setDownloading(format);
    try {
      const url = `/api/reports/trace?code=${encoded}&format=${format}`;
      const res = await fetch(url);

      // If the API returns JSON error, show friendly message instead of downloading.
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) {
        const body = contentType.includes("application/json")
          ? await res.json().catch(() => null)
          : await res.text().catch(() => "");
        setError(toFriendlyError(res.status, body));
        return;
      }

      const blob = await res.blob();
      const ext = format === "pdf" ? "pdf" : "csv";
      const filename = `trace_${trimmed}.${ext}`;
      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e: any) {
      setError(e?.message || "Failed to generate the report.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <h1 className="text-3xl font-semibold mb-4">
        Full Traceability Report
      </h1>

      <p className="text-gray-500 mb-6">
        Export complete parent–child hierarchy for regulatory review.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <label className="label">Code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="input w-full"
            placeholder="Enter unit / box / carton / pallet code"
          />
        </div>

        <div>
          <label className="label">Code Type (optional)</label>
          <select
            className="input w-full"
            value={codeType}
            onChange={(e) =>
              setCodeType(
                e.target.value as
                  | "AUTO"
                  | "UNIT"
                  | "BOX"
                  | "CARTON"
                  | "PALLET"
              )
            }
          >
            <option value="AUTO">Auto-detect</option>
            <option value="UNIT">Unit</option>
            <option value="BOX">Box</option>
            <option value="CARTON">Carton</option>
            <option value="PALLET">Pallet (SSCC)</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => download("csv")}
          disabled={downloading !== null}
          className={`btn-primary ${downloading !== null ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          {downloading === "csv" ? "Exporting…" : "Export CSV"}
        </button>

        <button
          type="button"
          onClick={() => download("pdf")}
          disabled={downloading !== null}
          className={`btn-primary ${downloading !== null ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          {downloading === "pdf" ? "Exporting…" : "Export PDF"}
        </button>
      </div>

      {!hasCode && !error ? (
        <p className="text-sm text-gray-500 mt-3">
          Enter a code, then export CSV or PDF.
        </p>
      ) : null}

      {error ? (
        <div className="mt-4 text-sm text-red-600">{error}</div>
      ) : null}

      <p className="text-sm text-gray-500 mt-3">
        Enter any valid code (unit/box/carton/pallet). The export returns the
        connected hierarchy for that code. “Code Type” is only for clarity in
        the UI; exports work the same in Auto-detect mode.
      </p>
    </div>
  );
}
