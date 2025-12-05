'use client';

import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

import GenerateLabel from '@/lib/generateLabel'; // adjust path if needed
import { buildGs1ElementString } from '@/lib/gs1Builder'; // adjust path if needed
import IssuePrinterSelector, { Printer } from '@/components/IssuePrinterSelector';

// Define the type locally since gs1Builder.js is JavaScript
type Gs1Fields = {
  gtin: string;
  mfdYYMMDD?: string;
  expiryYYMMDD?: string;
  batch?: string;
  mrp?: string;
  sku?: string;
  company?: string;
};

type CodeType = 'QR' | 'DATAMATRIX';

type FormState = {
  gtin: string;
  mfdDate?: string; // ISO date from <input type="date"> (YYYY-MM-DD)
  expiryDate?: string; // ISO date
  batch: string;
  mrp: string;
  sku: string;
  company: string;
  codeType: CodeType;
  quantity: number;
  printerId: string;
};

type BatchRow = {
  id: string;
  fields: Gs1Fields;
  payload: string;
  codeType: CodeType;
};

function isoDateToYYMMDD(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function formatDateForDisplay(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}

/** ZPL generator: embeds DataMatrix/QR as a PNG/graphic or uses ^B0 for 1D.
 * For simplicity we embed a "GS1 payload as human text" + DataMatrix via ZPL^BX is complex without raster.
 * This produces a textual ZPL template that expects the printer to handle graphic insertion by your pipeline.
 */
function buildZplForRow(row: BatchRow) {
  // simple text-only template with DataMatrix placeholder
  const top = '^XA\n';
  const payloadComment = `^FX Payload: ${row.payload}\n`;
  const fieldsLines =
    `^FO50,50^A0N,30,30^FDGTIN: ${row.fields.gtin}^FS\n` +
    `^FO50,90^A0N,30,30^FDMFD: ${row.fields.mfdYYMMDD ?? ''}^FS\n` +
    `^FO50,130^A0N,30,30^FDEXP: ${row.fields.expiryYYMMDD ?? ''}^FS\n` +
    `^FO50,170^A0N,30,30^FDBATCH: ${row.fields.batch ?? ''}^FS\n` +
    `^FO50,210^A0N,30,30^FDMRP: ${row.fields.mrp ?? ''}^FS\n` +
    `^FO50,250^A0N,30,30^FDSKU: ${row.fields.sku ?? ''}^FS\n` +
    `^FO50,290^A0N,30,30^FDCOMPANY: ${row.fields.company ?? ''}^FS\n`;
  const footer = '^XZ\n';
  return top + payloadComment + fieldsLines + footer;
}

/** EPL generator: basic text template */
function buildEplForRow(row: BatchRow) {
  // EPL is printer-specific; a simple human-readable label template:
  const lines = [
    'N', // clear image buffer
    `A50,50,0,3,1,1,N,"GTIN:${row.fields.gtin}"`,
    `A50,90,0,3,1,1,N,"MFD:${row.fields.mfdYYMMDD ?? ''}"`,
    `A50,130,0,3,1,1,N,"EXP:${row.fields.expiryYYMMDD ?? ''}"`,
    `A50,170,0,3,1,1,N,"BATCH:${row.fields.batch ?? ''}"`,
    `A50,210,0,3,1,1,N,"MRP:${row.fields.mrp ?? ''}"`,
    `P1` // print 1 copy
  ];
  return lines.join('\n') + '\n';
}

/** Build a PDF of labels — each label as an A6-like box per page */
async function buildPdf(rows: BatchRow[], size = 250) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }); // using points
  // We'll render one label per PDF page for simplicity
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // For each row, we can render payload text + human fields
    doc.setFontSize(10);
    doc.text(`GTIN: ${r.fields.gtin}`, 20, 30);
    doc.text(`MFD: ${r.fields.mfdYYMMDD ?? ''}`, 20, 50);
    doc.text(`EXP: ${r.fields.expiryYYMMDD ?? ''}`, 20, 70);
    doc.text(`BATCH: ${r.fields.batch ?? ''}`, 20, 90);
    doc.text(`MRP: ${r.fields.mrp ?? ''}`, 20, 110);
    doc.text(`SKU: ${r.fields.sku ?? ''}`, 20, 130);
    doc.text(`COMPANY: ${r.fields.company ?? ''}`, 20, 150);
    doc.text(`Payload: ${r.payload}`, 20, 180);

    if (i < rows.length - 1) doc.addPage();
  }

  return doc;
}

/** parse CSV text into BatchRow[].
  Expected headers: SKU, MFD, EXP, BATCH, MRP, QTY, CODE_TYPE
  GTIN, Company, and Printer ID are auto-fetched from form state
*/
async function csvToRows(csvText: string, gtin: string, company: string, printerId: string): Promise<BatchRow[]> {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const out: BatchRow[] = [];
  
  for (const row of parsed.data) {
    const mfdRaw = (row['MFD'] || row['mfd'] || row['Mfd'] || '').toString().trim();
    const expRaw = (row['EXP'] || row['Exp'] || row['expiry'] || '').toString().trim();
    const mrp = (row['MRP'] || row['mrp'] || '').toString().trim();
    const batch = (row['BATCH'] || row['batch'] || '').toString().trim();
    const sku = (row['SKU'] || row['sku'] || '').toString().trim();
    const qtyRaw = (row['QTY'] || row['qty'] || row['Qty'] || '1').toString().trim();
    const qty = Math.max(1, parseInt(qtyRaw) || 1);
    const codeTypeRaw = (row['CODE_TYPE'] || row['code_type'] || row['CodeType'] || '').toString().trim().toUpperCase();
    const rowCodeType: CodeType = (codeTypeRaw === 'DATAMATRIX' || codeTypeRaw === 'DM') ? 'DATAMATRIX' : 'QR';

    // Convert dates to ISO format for API
    const mfdISO = mfdRaw.length === 6 ? `20${mfdRaw.slice(0,2)}-${mfdRaw.slice(2,4)}-${mfdRaw.slice(4,6)}` : mfdRaw;
    const expISO = expRaw.length === 6 ? `20${expRaw.slice(0,2)}-${expRaw.slice(2,4)}-${expRaw.slice(4,6)}` : expRaw;

    // Call /api/issues to generate unique serials for this row
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gtin,
          batch,
          mfd: mfdISO || null,
          exp: expISO,
          quantity: qty,
          printer_id: printerId
        })
      });

      if (!res.ok) {
        throw new Error(`Failed to generate codes for row with SKU: ${sku}`);
      }

      const result = await res.json();
      
      // Add each unique code to batch
      result.items.forEach((item: any) => {
        out.push({
          id: `r${out.length + 1}`,
          fields: {
            gtin,
            mfdYYMMDD: isoDateToYYMMDD(mfdISO),
            expiryYYMMDD: isoDateToYYMMDD(expISO),
            batch: batch || undefined,
            mrp: mrp || undefined,
            sku: sku || undefined,
            company: company || undefined
          },
          payload: item.gs1,
          codeType: rowCodeType
        });
      });
    } catch (err) {
      throw new Error(`CSV row error: ${err}`);
    }
  }

  return out;
}

export default function Page() {
  const [form, setForm] = useState<FormState>({
    gtin: '1234567890123',
    mfdDate: undefined,
    expiryDate: undefined,
    batch: '',
    mrp: '',
    sku: '',
    company: '',
    codeType: 'QR',
    quantity: 1,
    printerId: ''
  });

  const [payload, setPayload] = useState<string | undefined>(undefined);
  const [batch, setBatch] = useState<BatchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);

  // Fetch printers from API
  async function fetchPrinters() {
    try {
      const res = await fetch('/api/printers');
      if (!res.ok) return [];
      const data = await res.json();
      setPrinters(data || []);
      return data || [];
    } catch {
      return [];
    }
  }

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  function handleBuild(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    try {
      const fields: Gs1Fields = {
        gtin: form.gtin,
        mfdYYMMDD: isoDateToYYMMDD(form.mfdDate),
        expiryYYMMDD: isoDateToYYMMDD(form.expiryDate),
        batch: form.batch || undefined,
        mrp: form.mrp || undefined,
        sku: form.sku || undefined,
        company: form.company || undefined
      };
      const built = buildGs1ElementString(fields);
      setPayload(built);
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }

  async function handleAddToBatch() {
    if (!payload) {
      setError('Build payload first');
      return;
    }
    if (!form.printerId) {
      setError('Please select or create a Printer ID');
      return;
    }
    
    const qty = Math.max(1, Math.floor(form.quantity));
    
    try {
      // Call /api/issues to generate unique serials
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gtin: form.gtin,
          batch: form.batch,
          mfd: form.mfdDate || null,
          exp: form.expiryDate,
          quantity: qty,
          printer_id: form.printerId
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Failed to generate unique codes');
        return;
      }
      
      const result = await res.json();
      const newRows: BatchRow[] = result.items.map((item: any, idx: number) => ({
        id: `b${batch.length + idx + 1}`,
        fields: {
          gtin: form.gtin,
          mfdYYMMDD: isoDateToYYMMDD(form.mfdDate),
          expiryYYMMDD: isoDateToYYMMDD(form.expiryDate),
          batch: form.batch || undefined,
          mrp: form.mrp || undefined,
          sku: form.sku || undefined,
          company: form.company || undefined
        },
        payload: item.gs1, // Use unique GS1 payload with serial from API
        codeType: form.codeType
      }));
      
      setBatch((s) => [...s, ...newRows]);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Network error');
    }
  }

  async function handleCsvUpload(file: File) {
    setError(null);
    
    if (!form.gtin) {
      setError('GTIN is required. Set it in the form first.');
      return;
    }
    if (!form.company) {
      setError('Company name is required. Set it in the form first.');
      return;
    }
    if (!form.printerId) {
      setError('Printer ID is required. Select or create one first.');
      return;
    }
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const csvData = (results as any).data instanceof Array ? Papa.unparse(results.data) : results.data;
          const rows = await csvToRows(csvData as string, form.gtin, form.company, form.printerId);
          setBatch(rows);
        } catch (e: any) {
          setError('CSV parse/build failed: ' + (e?.message || String(e)));
        }
      },
      error: (err) => {
        setError('CSV upload failed: ' + err.message);
      }
    });
  }

  async function handleExportPdf() {
    if (!batch.length) {
      setError('Batch empty');
      return;
    }
    const doc = await buildPdf(batch);
    const blob = doc.output('blob');
    saveAs(blob, 'labels.pdf');
  }

  async function handleExportZpl() {
    if (!batch.length) {
      setError('Batch empty');
      return;
    }
    const combined = batch.map(buildZplForRow).join('\n');
    const blob = new Blob([combined], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, 'labels.zpl');
  }

  async function handleExportEpl() {
    if (!batch.length) {
      setError('Batch empty');
      return;
    }
    const combined = batch.map(buildEplForRow).join('\n');
    const blob = new Blob([combined], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, 'labels.epl');
  }

  async function handleExportZipImages() {
    if (!batch.length) {
      setError('Batch empty');
      return;
    }
    const zip = new JSZip();
    // Render each payload to dataURL via GenerateLabel's QR rendering using qrcode.toDataURL
    // We'll do a minimal generation: build GS1 string is already there; use qrcode lib directly
    // dynamic import qrcode
    const qrcode = await import('qrcode');
    for (let i = 0; i < batch.length; i++) {
      const r = batch[i];
      const dataUrl = await (qrcode as any).toDataURL(r.payload, { margin: 1, width: 300 });
      // convert dataUrl to blob
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      zip.file(`label_${i + 1}.png`, blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'labels.zip');
  }

  const batchCount = batch.length;

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Generate Labels — GS1 (QR / DataMatrix)</h1>

      <div className="grid grid-cols-3 gap-6">
        <form className="col-span-2 bg-white p-4 rounded shadow" onSubmit={(e) => { e.preventDefault(); handleBuild(); }}>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-sm text-gray-600">GTIN</div>
              <input className="mt-1 p-2 border rounded w-full" value={form.gtin} onChange={(e) => update('gtin', e.target.value)} />
            </label>

            <label className="block">
              <div className="text-sm text-gray-600">Code Type</div>
              <select className="mt-1 p-2 border rounded w-full" value={form.codeType} onChange={(e) => update('codeType', e.target.value as CodeType)}>
                <option value="QR">QR</option>
                <option value="DATAMATRIX">DataMatrix</option>
              </select>
            </label>

            <label>
              <div className="text-sm text-gray-600">Manufacture Date (calendar)</div>
              <input type="date" className="mt-1 p-2 border rounded w-full" value={form.mfdDate ?? ''} onChange={(e) => update('mfdDate', e.target.value)} />
            </label>

            <label>
              <div className="text-sm text-gray-600">Expiry Date (calendar)</div>
              <input type="date" className="mt-1 p-2 border rounded w-full" value={form.expiryDate ?? ''} onChange={(e) => update('expiryDate', e.target.value)} />
            </label>

            <label>
              <div className="text-sm text-gray-600">Batch / Lot</div>
              <input className="mt-1 p-2 border rounded w-full" value={form.batch} onChange={(e) => update('batch', e.target.value)} />
            </label>

            <label>
              <div className="text-sm text-gray-600">MRP (Rs, e.g. 30 or 30.00)</div>
              <input className="mt-1 p-2 border rounded w-full" value={form.mrp} onChange={(e) => update('mrp', e.target.value)} />
            </label>

            <label>
              <div className="text-sm text-gray-600">SKU</div>
              <input className="mt-1 p-2 border rounded w-full" value={form.sku} onChange={(e) => update('sku', e.target.value)} />
            </label>

            <label>
              <div className="text-sm text-gray-600">Company</div>
              <input className="mt-1 p-2 border rounded w-full" value={form.company} onChange={(e) => update('company', e.target.value)} />
            </label>

            <div className="col-span-2">
              <IssuePrinterSelector
                printers={printers}
                selectedPrinter={form.printerId || null}
                onChange={(id) => update('printerId', id || '')}
                fetchPrinters={fetchPrinters}
              />
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                <strong>📌 Printer ID Instructions:</strong>
                <ul className="mt-1 ml-4 list-disc space-y-1">
                  <li>Click <strong>"Select"</strong> to choose from existing printers</li>
                  <li>Click <strong>"Create Printer"</strong> to add a new printer ID</li>
                  <li>Printer IDs must be <strong>2-20 characters</strong>: uppercase letters (A-Z), numbers (0-9), and hyphens (-) only</li>
                  <li>Examples: <code className="bg-white px-1 rounded">PR-01</code>, <code className="bg-white px-1 rounded">LINE-A</code>, <code className="bg-white px-1 rounded">PRINTER-123</code></li>
                </ul>
              </div>
            </div>

            <label>
              <div className="text-sm text-gray-600">Quantity</div>
              <input type="number" min="1" className="mt-1 p-2 border rounded w-full" value={form.quantity} onChange={(e) => update('quantity', parseInt(e.target.value) || 1)} />
            </label>
          </div>

          <div className="flex gap-2 mt-4">
            <button type="submit" className="px-4 py-2 bg-slate-800 text-white rounded" onClick={handleBuild}>Build & Preview</button>
            <button type="button" className="px-4 py-2 bg-slate-600 text-white rounded" onClick={handleAddToBatch}>Add to Batch</button>

            <label className="px-4 py-2 bg-white border rounded cursor-pointer">
              Upload CSV
              <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvUpload(f); }} />
            </label>

            <button type="button" className="px-4 py-2 bg-white border rounded" onClick={() => {
              const csv = 'SKU,MFD,EXP,BATCH,MRP,QTY,CODE_TYPE\nMED-001,250101,260101,BATCH001,30.00,100,QR\nMED-002,250101,260101,BATCH002,35.00,50,DATAMATRIX';
              const blob = new Blob([csv], { type: 'text/csv' });
              saveAs(blob, 'template.csv');
            }}>Download Template</button>

            <button type="button" className="px-4 py-2 bg-indigo-600 text-white rounded ml-auto" onClick={() => { setBatch([]); }}>Clear Batch</button>
          </div>

          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            <strong>📋 CSV Upload Instructions:</strong>
            <ul className="mt-1 ml-4 list-disc space-y-1">
              <li><strong>Required before upload:</strong> Set GTIN, Company Name, and Printer ID in the form above</li>
              <li><strong>CSV Columns:</strong> SKU, MFD, EXP, BATCH, MRP, QTY, CODE_TYPE</li>
              <li><strong>Date Format:</strong> YYMMDD (e.g., 250101 = Jan 1, 2025) or YYYY-MM-DD</li>
              <li><strong>CODE_TYPE:</strong> QR or DATAMATRIX</li>
              <li>Each row generates unique serials automatically via API (21)</li>
            </ul>
          </div>

          {error && <div className="mt-3 text-red-600">{error}</div>}
          <div className="mt-4">
            <div className="text-sm text-gray-500">Payload (built):</div>
            <pre className="p-2 bg-gray-50 rounded text-xs overflow-auto">{payload || 'No payload yet'}</pre>
          </div>
        </form>

        <div className="col-span-1">
          <div className="bg-white p-4 rounded shadow mb-4">
            <div className="font-medium mb-2">Preview</div>
            {payload ? (
              <GenerateLabel payload={payload} codeType={form.codeType} size={300} filename={`label_${form.gtin || 'unknown'}.png`} showText={true} />
            ) : (
              <div className="p-6 border rounded text-sm text-gray-500">Build a payload to preview here.</div>
            )}
          </div>

          <div className="bg-white p-3 rounded shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium">Batch ({batchCount})</div>
              <div className="text-xs text-gray-500">Ready to export</div>
            </div>

            <div className="space-y-2 max-h-64 overflow-auto">
              {batch.map((b, idx) => (
                <div key={b.id} className="p-2 border rounded flex justify-between items-center">
                  <div className="text-sm">
                    <div className="font-medium">#{idx + 1} — {b.fields.gtin}</div>
                    <div className="text-xs text-gray-500">{b.fields.batch} • {b.fields.sku} • {b.fields.company}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-2 py-1 bg-slate-100 rounded text-xs" onClick={() => { navigator.clipboard?.writeText(b.payload); }}>Copy</button>
                    <button className="px-2 py-1 bg-red-50 rounded text-xs" onClick={() => setBatch((s) => s.filter((x) => x.id !== b.id))}>Remove</button>
                  </div>
                </div>
              ))}
              {batch.length === 0 && <div className="text-sm text-gray-500">Batch is empty. Add items from the form or via CSV upload.</div>}
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={handleExportPdf}>Export PDF</button>
              <button className="px-3 py-2 bg-emerald-600 text-white rounded" onClick={handleExportZipImages}>Export ZIP (PNGs)</button>
              <button className="px-3 py-2 bg-gray-800 text-white rounded" onClick={handleExportZpl}>Export ZPL (text)</button>
              <button className="px-3 py-2 bg-gray-700 text-white rounded" onClick={handleExportEpl}>Export EPL (text)</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
