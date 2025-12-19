import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export type Printer = {
  id: string;
  printer_id: string;
  name?: string;
  is_active?: boolean;
};

type Props = {
  printers?: Printer[];                       // optional preloaded list
  selectedPrinter?: string | null;
  onChange: (printerId: string | null) => void;
  fetchPrinters?: () => Promise<Printer[]>;  // optional fetch callback
};

export default function IssuePrinterSelector({
  printers = [],
  selectedPrinter = null,
  onChange,
  fetchPrinters,
}: Props) {
  const router = useRouter();
  const [openSelect, setOpenSelect] = useState(false);
  const [list, setList] = useState<Printer[]>(printers);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If no printers passed and a fetchPrinters exists, lazy-load them
    if (list.length === 0 && fetchPrinters) {
      setLoading(true);
      fetchPrinters()
        .then((r) => setList(r || []))
        .catch(() => setList([]))
        .finally(() => setLoading(false));
    }
  }, [fetchPrinters, list.length]);

  function handleCreate() {
    // navigate to the printer registration page; after create the page should redirect back
    router.push("/dashboard/printers");
  }

  return (
    <div className="w-full">
      {/* placeholder / selected */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          {selectedPrinter ? (
            <div className="px-4 py-2.5 border border-slate-300 rounded-lg bg-white text-sm">
              <span className="font-medium text-slate-900">{selectedPrinter}</span>
              <div className="text-xs text-slate-500">Selected printer</div>
            </div>
          ) : (
            <div className="px-4 py-2.5 border border-slate-300 rounded-lg bg-slate-50 text-sm text-slate-500">
              No printer selected (optional)
            </div>
          )}
        </div>

        {/* small buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white hover:bg-slate-50 transition font-medium"
            onClick={() => setOpenSelect((s) => !s)}
          >
            {openSelect ? 'Close' : 'Select'}
          </button>

          <button
            type="button"
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition font-medium whitespace-nowrap"
            onClick={handleCreate}
          >
            + New
          </button>
        </div>
      </div>

      {/* inline select dropdown (shows when Select clicked) */}
      {openSelect && (
        <div className="mt-2">
          {loading ? (
            <div className="text-sm text-slate-500">Loading printers…</div>
          ) : list.length === 0 ? (
            <div className="text-sm text-slate-500">No printers found. Click “Create Printer” to add one.</div>
          ) : (
            <select
              className="mt-1 w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              value={selectedPrinter ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                onChange(v);
                setOpenSelect(false);
              }}
            >
              <option value="">-- select a printer --</option>
              {list.map((p) => (
                <option key={p.id} value={p.printer_id}>
                  {p.printer_id} {p.name ? `— ${p.name}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
