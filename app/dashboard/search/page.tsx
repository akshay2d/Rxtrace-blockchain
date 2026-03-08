"use client";

import { useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";

type NodeRecord = {
  sscc?: string;
  created_at?: string;
} | null;

type SearchResponse = {
  type: string;
  level: string;
  data: {
    pallet: NodeRecord;
    carton: NodeRecord;
    box: NodeRecord;
    uid: string | null;
  };
};

function formatDate(value?: string) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

function HierarchyCard({
  title,
  identifier,
  created,
}: {
  title: string;
  identifier?: string | null;
  created?: string;
}) {
  return (
    <div className="bg-white border rounded-xl shadow-sm p-5 w-full max-w-md">
      <div className="text-sm font-semibold text-gray-600">{title}</div>

      <div className="font-mono text-lg mt-2 break-all">
        {identifier || "-"}
      </div>

      <div className="text-xs text-gray-400 mt-2">
        Created: {formatDate(created)}
      </div>
    </div>
  );
}

export default function Page() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    const trimmed = code.trim();

    if (!trimmed) {
      setError("Please enter or scan a code.");
      return;
    }

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const supabase = supabaseClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("User not authenticated");

      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!company?.id) throw new Error("Company not found");

      const res = await fetch(
        `/api/search?code=${encodeURIComponent(
          trimmed
        )}&company_id=${encodeURIComponent(company.id)}`
      );

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Search failed");

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleSearch();
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">

      {/* Header */}

      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Supply Chain Traceability
        </h1>

        <p className="text-sm text-gray-500 mt-1">
          Scan or enter Serial, SSCC, GS1 payload, or verification URL
        </p>
      </div>

      {/* Search Box */}

      <div className="bg-white border rounded-xl shadow-sm p-6 flex gap-4">

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scan or enter Serial / SSCC"
          className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>

      </div>

      {/* Error */}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          {error}
        </div>
      )}

      {/* Result */}

      {result && (
        <div className="flex flex-col items-center space-y-4">

          {result.data?.pallet && (
            <HierarchyCard
              title="Pallet"
              identifier={result.data.pallet?.sscc}
              created={result.data.pallet?.created_at}
            />
          )}

          {result.data?.carton && (
            <>
              <div className="text-gray-400">↓</div>
              <HierarchyCard
                title="Carton"
                identifier={result.data.carton?.sscc}
                created={result.data.carton?.created_at}
              />
            </>
          )}

          {result.data?.box && (
            <>
              <div className="text-gray-400">↓</div>
              <HierarchyCard
                title="Box"
                identifier={result.data.box?.sscc}
                created={result.data.box?.created_at}
              />
            </>
          )}

          {result.data?.uid && (
            <>
              <div className="text-gray-400">↓</div>
              <HierarchyCard
                title="Unit"
                identifier={result.data.uid}
              />
            </>
          )}

        </div>
      )}

    </div>
  );
}