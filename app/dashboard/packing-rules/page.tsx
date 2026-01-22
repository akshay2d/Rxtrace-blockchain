"use client";
import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import QRCodeComponent from "@/components/custom/QRCodeComponent";
import DataMatrixComponent from "@/components/custom/DataMatrixComponent";
import { supabaseClient } from "@/lib/supabase/client";
import { exportLabels as exportLabelsUtil, LabelData } from "@/lib/labelExporter";

type CodeType = "QR" | "DATAMATRIX";
type ExportFormat = "PDF" | "PNG" | "ZPL" | "EPL" | "ZIP" | "PRINT";
type GenerationLevel = "BOX" | "CARTON" | "PALLET";

type SSCCLabel = {
  id: string;
  sscc: string;
  sscc_with_ai: string;
  sku_id: string;
  pallet_id: string;
};

function toErrorMessage(value: unknown): string {
  if (!value) return "Unknown error";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || "Unknown error";

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message) return obj.message;
    if (typeof obj.error === "string" && obj.error) return obj.error;
    try {
      return JSON.stringify(value);
    } catch {
      return "Unknown error";
    }
  }

  return String(value);
}

export default function PackagingRulesPage() {
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [existingRules, setExistingRules] = useState<Array<{sku_id: string, version: number}>>([]);

  const [stripsPerBox, setStripsPerBox] = useState("");
  const [boxesPerCarton, setBoxesPerCarton] = useState("");
  const [cartonsPerPallet, setCartonsPerPallet] = useState("");

  const [ssccLabels, setSsccLabels] = useState<SSCCLabel[]>([]);
  const [codeType, setCodeType] = useState<CodeType>("DATAMATRIX");
  const [generationLevel, setGenerationLevel] = useState<GenerationLevel>("PALLET");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // SKU selector for generation
  const [skus, setSkus] = useState<Array<{id: string; sku_code: string; sku_name: string}>>([]);
  const [selectedSkuId, setSelectedSkuId] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSave =
    !!selectedSkuId &&
    Number(stripsPerBox) > 0 &&
    Number(boxesPerCarton) > 0 &&
    Number(cartonsPerPallet) > 0;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseClient().auth.getUser();
      
      if (!user) {
        setError("⚠️ Please log in to continue.");
        return;
      }

      // Try to get existing company
      let { data: company } = await supabaseClient()
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      // If no company exists, try to create one automatically
      if (!company) {
        // Check localStorage for pending company data (from signup)
        const pendingData = localStorage.getItem("pending_company_data");
        
        if (pendingData) {
          try {
            const companyData = JSON.parse(pendingData);
            const { data: newCompany, error } = await supabaseClient()
              .from("companies")
              .insert(companyData)
              .select("id")
              .single();
            
            if (!error && newCompany) {
              company = newCompany;
              localStorage.removeItem("pending_company_data");
              setSuccess("✅ Company profile created successfully!");
            }
          } catch (e) {
            console.error("Failed to create company from pending data:", e);
          }
        }
        
        // If still no company, redirect to company setup (backend-first guard)
        if (!company) {
          router.push('/dashboard/company-setup');
          return;
        }
      }

      if (company?.id) {
        setCompanyId(company.id);

        // Fetch SKUs via server API (avoids RLS issues so we can display sku_name, not UUID)
        try {
          const skuRes = await fetch("/api/skus", { cache: "no-store" });
          const skuOut = await skuRes.json();
          const skusData = (skuOut?.skus ?? []) as Array<{ id: string; sku_code: string; sku_name: string }>;
          if (Array.isArray(skusData) && skusData.length > 0) {
            setSkus(skusData);
            setSelectedSkuId(skusData[0].id);
          } else {
            setSkus([]);
            setSelectedSkuId("");
          }
        } catch (e) {
          console.error("Failed to load SKUs:", e);
        }
        
        // Fetch existing packing rules for this company
        const { data: rules } = await supabaseClient()
          .from("packing_rules")
          .select("sku_id, version")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false });
        
        if (rules) {
          setExistingRules(rules);
        }
      }
    })();
  }, []);

  async function saveRule() {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (!companyId) {
        setError("Company ID not found. Please refresh and try again.");
        return;
      }

      const selectedSku = skus.find((s) => s.id === selectedSkuId);
      if (!selectedSku) {
        setError("Please select a SKU before saving a packing rule.");
        return;
      }

      const res = await fetch("/api/packing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          // SKU id (UUID) always comes from SKU master
          sku_id: selectedSku.id,
          strips_per_box: Number(stripsPerBox),
          boxes_per_carton: Number(boxesPerCarton),
          cartons_per_pallet: Number(cartonsPerPallet),
          sscc_company_prefix: "1234567", // Default GS1 company prefix
          sscc_extension_digit: 0
        })
      });

      const out = await res.json();
      if (out.error) {
        setError(toErrorMessage(out.error));
      } else {
        setSuccess(
          `✅ Packing rule saved for SKU ${selectedSku.sku_code}${selectedSku.sku_name ? ` (${selectedSku.sku_name})` : ""}.`
        );
      }
    } catch (err: any) {
      setError(toErrorMessage(err) || "Failed to save packing rule");
    } finally {
      setLoading(false);
    }
  }

  async function generateBulkSSCC() {
    setError("");
    setSuccess("");
    setSsccLabels([]);
    setLoading(true);

    try {
      if (!companyId) {
        setError("Company ID not found. Please refresh and try again.");
        return;
      }

      // Get selected SKU details
      const selectedSku = skus.find(s => s.id === selectedSkuId);
      if (!selectedSku) {
        setError("Please select a SKU.");
        return;
      }
      
      // Determine API endpoint based on generation level
      let apiEndpoint = '';
      let requestBody: any = {
        sku_id: selectedSku.id,
        company_id: companyId,
        quantity: quantity
      };

      switch (generationLevel) {
        case 'BOX':
          apiEndpoint = '/api/box/create';
          requestBody.box_count = quantity;
          break;
        case 'CARTON':
          apiEndpoint = '/api/carton/create';
          requestBody.carton_count = quantity;
          break;
        case 'PALLET':
          apiEndpoint = '/api/pallet/create';
          requestBody.pallet_count = quantity;
          break;
      }
      
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      const out = await res.json();
      if (out.error) {
        setError(toErrorMessage(out.error));
      } else {
        // Handle different response formats
        const items = out.pallets || out.cartons || out.boxes || [];
        const labels: SSCCLabel[] = items.map((item: any) => ({
          id: item.id,
          sscc: item.sscc,
          sscc_with_ai: item.sscc_with_ai,
          sku_id: item.sku_id,
          pallet_id: item.id
        }));
        setSsccLabels(labels);
        setSuccess(`Successfully generated ${labels.length} ${generationLevel} labels!`);
      }
    } catch (err: any) {
      setError(toErrorMessage(err) || `Failed to generate ${generationLevel} labels`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setLoading(true);

    try {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true
      });

      const allLabels: SSCCLabel[] = [];

      for (const row of parsed.data) {
        const sku = (row["SKU"] || row["sku_id"] || "").toString().trim();
        const qty = Math.max(1, parseInt(row["QUANTITY"] || row["quantity"] || "1", 10) || 1);

        if (!sku) continue;

        const res = await fetch("/api/sscc/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku_id: sku,
            company_id: companyId,
            pallet_count: qty
          })
        });

        const out = await res.json();
        if (out.pallets) {
          const labels: SSCCLabel[] = out.pallets.map((p: any) => ({
            id: p.id,
            sscc: p.sscc,
            sscc_with_ai: p.sscc_with_ai,
            sku_id: p.sku_id,
            pallet_id: p.id
          }));
          allLabels.push(...labels);
        }
      }

      setSsccLabels(allLabels);
      setSuccess(`Generated ${allLabels.length} SSCC labels from CSV!`);
    } catch (err: any) {
      setError(toErrorMessage(err) || "Failed to process CSV");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Convert SSCC labels to LabelData format for export
  function ssccToLabelData(): LabelData[] {
    return ssccLabels.map(label => ({
      id: label.id,
      payload: label.sscc_with_ai,
      codeType: codeType,
      displayText: `SSCC: ${label.sscc} | SKU: ${getSkuDisplay(label.sku_id)}`,
      metadata: { sscc: label.sscc, sku_id: label.sku_id, pallet_id: label.pallet_id }
    }));
  }

  async function exportLabels(format: ExportFormat) {
    if (ssccLabels.length === 0) {
      setError("No labels to export");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const labels = ssccToLabelData();
      const filename = `sscc_labels_${Date.now()}`;
      await exportLabelsUtil(labels, format as any, filename);
      setSuccess(`Exported ${ssccLabels.length} labels as ${format}`);
    } catch (err) {
      setError(`Failed to export ${format}: ${toErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }

  function downloadCSVTemplate() {
    const csv = "SKU,QUANTITY\n<SKU_CODE_FROM_MASTER>,5\n<SKU_CODE_FROM_MASTER>,10";
    saveAs(new Blob([csv], { type: "text/csv" }), "sscc_template.csv");
  }

  function getSkuDisplay(skuIdOrCode: string) {
    const byId = skus.find((s) => s.id === skuIdOrCode);
    if (byId) return `${byId.sku_code}${byId.sku_name ? ` - ${byId.sku_name}` : ""}`;
    const byCode = skus.find((s) => s.sku_code === skuIdOrCode);
    if (byCode) return `${byCode.sku_code}${byCode.sku_name ? ` - ${byCode.sku_name}` : ""}`;
    return skuIdOrCode;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">SSCC Label Generator</h1>
              <p className="text-slate-600">Professional bulk SSCC label generation with GS1 compliance</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={downloadCSVTemplate}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition text-sm font-medium"
              >
                📥 Download CSV Template
              </button>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-green-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-green-800 font-medium">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Packing Rule Configuration */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Packaging Configuration</h2>
                  <p className="text-sm text-slate-500">Define your packaging hierarchy</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Select SKU *
                    <span className="text-xs text-slate-500 ml-2">From SKU master</span>
                  </label>
                  <select
                    value={selectedSkuId}
                    onChange={e => setSelectedSkuId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
                  >
                    <option value="">-- Select SKU --</option>
                    {skus.map(sku => (
                      <option key={sku.id} value={sku.id}>
                        {sku.sku_code}{sku.sku_name ? ` - ${sku.sku_name}` : ""}
                      </option>
                    ))}
                  </select>
                  {skus.length === 0 && (
                    <p className="text-xs text-orange-600 mt-1">⚠️ No SKUs found. Create SKUs first in Unit Label Generator.</p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <RuleInput label="Strips/Box" value={stripsPerBox} setValue={setStripsPerBox} />
                  <RuleInput label="Boxes/Carton" value={boxesPerCarton} setValue={setBoxesPerCarton} />
                  <RuleInput label="Cartons/Pallet" value={cartonsPerPallet} setValue={setCartonsPerPallet} />
                </div>

                <button
                  onClick={saveRule}
                  disabled={!canSave || loading}
                  className={`w-full px-6 py-3 rounded-lg transition font-medium ${
                    canSave && !loading
                      ? "bg-slate-800 text-white hover:bg-slate-900 shadow-sm hover:shadow"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {loading ? "Saving..." : "💾 Set Packaging Rule"}
                </button>
              </div>
            </div>

            {/* Bulk Generation */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Bulk Generation</h2>
                  <p className="text-sm text-slate-500">Generate multiple SSCC labels at once</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Generation Level</label>
                    <select
                      value={generationLevel}
                      onChange={e => setGenerationLevel(e.target.value as GenerationLevel)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
                    >
                      <option value="BOX">Box</option>
                      <option value="CARTON">Carton</option>
                      <option value="PALLET">Pallet (SSCC)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Code Type</label>
                    <select
                      value={codeType}
                      onChange={e => setCodeType(e.target.value as CodeType)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
                    >
                      <option value="DATAMATRIX">DataMatrix</option>
                      <option value="QR">QR Code</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={quantity}
                      onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <button
                  onClick={generateBulkSSCC}
                  disabled={loading || !companyId || !selectedSkuId}
                  className={`w-full px-6 py-3 rounded-lg transition font-medium ${
                    !loading && companyId && selectedSkuId
                      ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {loading ? "⏳ Generating..." : `⚡ Generate ${generationLevel} Labels`}
                </button>
                <p className="text-xs text-center text-slate-500">
                  Uses the latest packing rule saved for the selected SKU
                </p>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-slate-500">or</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Upload CSV File</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="w-full px-6 py-3 border-2 border-dashed border-slate-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition text-slate-600 hover:text-blue-600 font-medium"
                  >
                    📄 Upload CSV for Bulk Generation
                  </button>
                  <p className="text-xs text-slate-500 mt-2">CSV format: SKU, QUANTITY</p>
                </div>
              </div>
            </div>

            {/* Export Options */}
            {ssccLabels.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Export Labels</h2>
                    <p className="text-sm text-slate-500">{ssccLabels.length} labels ready for export</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <button
                    onClick={() => exportLabels("PRINT")}
                    disabled={loading}
                    className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium text-sm disabled:bg-slate-300 col-span-3"
                  >
                    🖨️ Print
                  </button>
                </div>

                <div className="grid grid-cols-5 gap-3">
                  <button
                    onClick={() => exportLabels("PDF")}
                    disabled={loading}
                    className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium text-sm disabled:bg-slate-300"
                  >
                    📕 PDF
                  </button>
                  <button
                    onClick={() => exportLabels("PNG")}
                    disabled={loading}
                    className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm disabled:bg-slate-300"
                  >
                    🖼️ PNG
                  </button>
                  <button
                    onClick={() => exportLabels("ZPL")}
                    disabled={loading}
                    className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm disabled:bg-slate-300"
                  >
                    🖨️ ZPL
                  </button>
                  <button
                    onClick={() => exportLabels("EPL")}
                    disabled={loading}
                    className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium text-sm disabled:bg-slate-300"
                  >
                    📄 EPL
                  </button>
                  <button
                    onClick={() => exportLabels("ZIP")}
                    disabled={loading}
                    className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium text-sm disabled:bg-slate-300"
                  >
                    📦 ZIP
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <h3 className="font-semibold text-slate-900">Live Preview</h3>
              </div>

              {ssccLabels.length > 0 ? (
                <div className="space-y-4">
                  <div className="border-2 border-slate-200 rounded-lg p-4 bg-slate-50">
                    <div className="flex items-center justify-center mb-3">
                      {codeType === "DATAMATRIX" ? (
                        <DataMatrixComponent
                          value={ssccLabels[0].sscc_with_ai}
                          size={200}
                        />
                      ) : (
                        <QRCodeComponent
                          value={ssccLabels[0].sscc_with_ai}
                          size={200}
                        />
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-medium text-slate-600 mb-1">SSCC</p>
                      <p className="text-sm font-mono font-bold text-slate-900">{ssccLabels[0].sscc}</p>
                      <p className="text-xs text-slate-500 mt-2">SKU: {getSkuDisplay(ssccLabels[0].sku_id)}</p>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Total Labels:</span>
                      <span className="font-bold text-blue-600">{ssccLabels.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-slate-600">Code Type:</span>
                      <span className="font-semibold text-slate-900">{codeType}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setSsccLabels([])}
                    className="w-full px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition text-sm font-medium"
                  >
                    🗑️ Clear All Labels
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500 mb-1">No labels generated yet</p>
                  <p className="text-xs text-slate-400">Generate labels to see preview</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RuleInput({
  label,
  value,
  setValue
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      <input
        type="number"
        min="1"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
        placeholder="Enter quantity"
      />
    </div>
  );
}
