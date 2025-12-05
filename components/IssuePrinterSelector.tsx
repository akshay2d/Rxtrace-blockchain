import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export type Printer = {
  id: string;
  name?: string;
  model?: string;
  location?: string;
  active?: boolean;
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
      <label className="block text-sm font-medium text-slate-700 mb-1">Printer</label>

      {/* placeholder / selected */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          {selectedPrinter ? (
            <div className="px-3 py-2 border rounded bg-white text-sm">
              <span className="font-medium">{selectedPrinter}</span>
              <div className="text-xs text-slate-500">Selected printer</div>
            </div>
          ) : (
            <div className="px-3 py-2 border rounded bg-slate-50 text-sm text-slate-500">
              No printer selected — choose one or create a new printer
            </div>
          )}
        </div>

        {/* small buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-slate-50"
            onClick={() => setOpenSelect((s) => !s)}
          >
            Select
          </button>

          <button
            type="button"
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm"
            onClick={handleCreate}
          >
            Create Printer ID
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
              className="mt-1 w-full border rounded px-3 py-2 text-sm bg-white"
              value={selectedPrinter ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                onChange(v);
                setOpenSelect(false);
              }}
            >
              <option value="">-- select a printer --</option>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} {p.name ? `— ${p.name}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
