"use client";

import { useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";

export default function Page() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  async function search() {
    setError("");
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabaseClient().auth.getUser();

      if (!user) {
        setError("Please sign in to search.");
        return;
      }

      const { data: company } = await supabaseClient()
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!company?.id) {
        setError("No company found for this user.");
        return;
      }

      const res = await fetch(
        `/api/search?code=${encodeURIComponent(code)}&company_id=${encodeURIComponent(
          company.id
        )}`
      );
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <h1 className="text-3xl font-semibold mb-6">
        Traceability Search
      </h1>

      {/* Search box */}
      <div className="flex gap-4 mb-8">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Scan or enter unit / box / carton / pallet code"
          className="input flex-1"
        />
        <button onClick={search} className="btn-primary">
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="border rounded-xl p-6">
          <h2 className="font-medium mb-4">Result</h2>
          <pre className="text-xs overflow-auto p-3 bg-black/5 rounded">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {error && <div className="mt-6 text-sm text-red-600">{error}</div>}
    </div>
  );
}
