"use client";

import { useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Search, Package, Box, Layers, Truck, AlertCircle, Loader2 } from "lucide-react";

// Type icons mapping
const typeIcons: Record<string, React.ReactNode> = {
  unit: <Package className="w-5 h-5 text-blue-600" />,
  box: <Box className="w-5 h-5 text-green-600" />,
  carton: <Layers className="w-5 h-5 text-orange-600" />,
  pallet: <Truck className="w-5 h-5 text-purple-600" />,
};

const typeLabels: Record<string, string> = {
  unit: "Unit",
  box: "Box",
  carton: "Carton",
  pallet: "Pallet",
};

const typeColors: Record<string, string> = {
  unit: "bg-blue-50 border-blue-200 text-blue-700",
  box: "bg-green-50 border-green-200 text-green-700",
  carton: "bg-orange-50 border-orange-200 text-orange-700",
  pallet: "bg-purple-50 border-purple-200 text-purple-700",
};

export default function Page() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  async function search() {
    // Client-side validation - prevent empty searches
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("Please enter a unit, box, carton, or pallet code to search.");
      setResult(null);
      return;
    }

    setError("");
    setResult(null);
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
        setError("No company found for this user. Please complete company setup first.");
        return;
      }

      const res = await fetch(
        `/api/search?code=${encodeURIComponent(trimmedCode)}&company_id=${encodeURIComponent(
          company.id
        )}`
      );
      const data = await res.json();
      
      if (!res.ok) {
        setError(data?.error || "Search failed. Please try again.");
        return;
      }
      
      setResult(data);
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  // Handle Enter key press
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !loading) {
      search();
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-900">
          Traceability Search
        </h1>
        <p className="text-gray-500 mt-2">
          Search for units, boxes, cartons, or pallets by scanning or entering their code
        </p>
      </div>

      {/* Search box */}
      <div className="bg-white border rounded-xl p-6 mb-8 shadow-sm">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(""); // Clear error when user types
              }}
              onKeyDown={handleKeyDown}
              placeholder="Scan or enter unit / box / carton / pallet code (e.g., SSCC, serial number)"
              className="w-full pl-12 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400"
            />
          </div>
          <button 
            onClick={search} 
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Searching…
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Search
              </>
            )}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          {/* Result Header */}
          <div className={`px-6 py-4 border-b flex items-center gap-3 ${typeColors[result.type] || "bg-gray-50"}`}>
            {typeIcons[result.type] || <Package className="w-5 h-5" />}
            <div>
              <span className="font-semibold">{typeLabels[result.type] || "Item"} Found</span>
              <span className="text-sm ml-2 opacity-75">Level: {result.level}</span>
            </div>
          </div>
          
          {/* Result Data */}
          <div className="p-6">
            <h3 className="font-medium text-gray-700 mb-3">Traceability Data</h3>
            <pre className="text-xs overflow-auto p-4 bg-slate-50 rounded-lg border text-gray-700 max-h-[500px]">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Empty state - show when no search yet */}
      {!result && !error && !loading && (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <Search className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">Search the Supply Chain</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Enter a unit serial, box code, carton code, or pallet SSCC to trace items through the packaging hierarchy.
          </p>
          <div className="mt-6 flex justify-center gap-6 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-500" /> Unit
            </div>
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-green-500" /> Box
            </div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-500" /> Carton
            </div>
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-purple-500" /> Pallet
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
