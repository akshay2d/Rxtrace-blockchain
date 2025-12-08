'use client';

import React, { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

import GenerateLabel from '@/lib/generateLabel'; // adjust path if needed 
import { buildGs1ElementString } from '@/lib/gs1Builder'; // adjust path if needed
import IssuePrinterSelector, { Printer } from '@/components/IssuePrinterSelector';
import QRCodeComponent from '@/components/custom/QRCodeComponent';
import DataMatrixComponent from '@/components/custom/DataMatrixComponent';

// Define the type locally since gs1Builder.js is JavaScript
type Gs1Fields = {
  gtin: string;
  mfdYYMMDD?: string;
  expiryYYMMDD?: string;
  batch?: string;
  mrp?: string;
  sku?: string;
  company?: string;
  serial?: string;
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

/** Generate GTIN with optional custom prefix */
function generateGTIN(prefix?: string): string {
  const customPrefix = prefix || '890'; // Default India prefix
  const prefixLen = customPrefix.length;
  const remainingDigits = 13 - prefixLen; // GTIN-13 format
  const random = Math.floor(Math.random() * Math.pow(10, remainingDigits))
    .toString()                                                               .padStart(remainingDigits, '0');
  return `${customPrefix}${random}`;
}

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

/** ZPL generator: embeds DataMatrix/QR as a PNG/graphic or uses ^B0 for 1
D.                                                                         * For simplicity we embed a "GS1 payload as human text" + DataMatrix via 
ZPL^BX is complex without raster.
 * This produces a textual ZPL template that expects the printer to handle
 graphic insertion by your pipeline.                                       */
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

/** Build a PDF of labels — 10x10 grid = 100 codes per A4 page */      
async function buildPdf(rows: BatchRow[], size = 250) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const qrcode = await import('qrcode');
  const bwipjs = await import('bwip-js');

  // Grid: 10 columns x 10 rows = 100 per page
  const cols = 10;
  const rowsPerPage = 10;
  const perPage = cols * rowsPerPage;

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const gap = 5;

  const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  const cellH = (pageH - margin * 2 - gap * (rowsPerPage - 1)) / rowsPerPage;

  for (let p = 0; p < rows.length; p += perPage) {
    if (p > 0) doc.addPage();
    const pageItems = rows.slice(p, p + perPage);

    for (let idx = 0; idx < pageItems.length; idx++) {
      const item = pageItems[idx];
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = margin + col * (cellW + gap);
      const y = margin + row * (cellH + gap);

      let dataUrl: string | null = null;
      try {
        if (item.codeType === 'QR') {
          dataUrl = await (qrcode as any).toDataURL(item.payload, { margin: 1, width: Math.floor(cellW * 2) });
        } else {
          const canvas = document.createElement('canvas');
          const sz = Math.floor(Math.min(cellW, cellH) * 2);
          canvas.width = sz;
          canvas.height = sz;
          await (bwipjs as any).toCanvas(canvas, {
            bcid: 'datamatrix',
            text: item.payload,
            scale: 3,
            includetext: false
          });
          dataUrl = canvas.toDataURL('image/png');
        }
      } catch (err) {
        console.error('PDF render failed for item', p + idx, err);
      }

      if (dataUrl) {
        try {
          const imgH = cellH - 10;
          doc.addImage(dataUrl, 'PNG', x, y, cellW, imgH);
        } catch (err) {
          console.error('Failed to add image', err);
        }
      }

      // Add serial text below image
      if (item.fields.serial) {
        doc.setFontSize(6);
        doc.text(item.fields.serial.toString(), x + 2, y + cellH - 2);
      }
    }
  }

  return doc;
}

/** parse CSV text into BatchRow[].
  Expected headers: GTIN, SKU, MFD, EXP, BATCH, MRP, COMPANY, QTY, CODE_TYPE
  Only Printer ID is required from form state
  GTIN is optional - will auto-generate if blank
*/
async function csvToRows(csvText: string, printerId: string): Promise<BatchRow[]> {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const out: BatchRow[] = [];
  
  for (const row of parsed.data) {
    const gtinRaw = (row['GTIN'] || row['gtin'] || '').toString().trim();
    const gtin = gtinRaw || generateGTIN(); // Auto-generate if blank
    const mfdRaw = (row['MFD'] || row['mfd'] || row['Mfd'] || '').toString().trim();
    const expRaw = (row['EXP'] || row['Exp'] || row['expiry'] || '').toString().trim();
    const mrp = (row['MRP'] || row['mrp'] || '').toString().trim();
    const batch = (row['BATCH'] || row['batch'] || '').toString().trim();
    const sku = (row['SKU'] || row['sku'] || '').toString().trim();
    const companyName = (row['COMPANY'] || row['company'] || row['MANUFACTURER'] || row['manufacturer'] || '').toString().trim();
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
          printer_id: printerId,
          mrp: mrp || undefined,
          sku: sku || undefined,
          company: companyName || undefined
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
            company: companyName || undefined
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
  const [company, setCompany] = useState<string>('');

  // Fetch company from Supabase on mount
  React.useEffect(() => {
    async function fetchCompany() {
      try {
        const { supabaseClient } = await import('@/lib/supabase/client');
        const { data: { user } } = await supabaseClient().auth.getUser();
        if (user) {
          const { data } = await supabaseClient()
            .from('companies')
            .select('company_name')
            .eq('user_id', user.id)
            .single();
          if (data?.company_name) {
            setCompany(data.company_name);
            setForm(prev => ({ ...prev, company: data.company_name }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch company:', err);
      }
    }
    fetchCompany();
  }, []);

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
      const finalGtin = form.gtin || generateGTIN(); // Auto-generate if blank
      const fields: Gs1Fields = {
        gtin: finalGtin,
        mfdYYMMDD: isoDateToYYMMDD(form.mfdDate),
        expiryYYMMDD: isoDateToYYMMDD(form.expiryDate),
        batch: form.batch || undefined,
        mrp: form.mrp || undefined,
        sku: form.sku || undefined,
        company: company || undefined
      };
      const built = buildGs1ElementString(fields);
      setPayload(built);
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }

  async function handleAddToBatch() {
    // Allow add-to-batch even if preview wasn't built; API will return GS1 payloads
    if (!form.printerId) {
      setError('Please select or create a Printer ID');
      return;
    }
    if (!company) {
      setError('Company name not found. Please check your registration.');
      return;
    }
    
    const qty = Math.max(1, Math.floor(form.quantity));
    const finalGtin = form.gtin || generateGTIN(); // Auto-generate if blank
    
    try {
      // Call /api/issues to generate unique serials
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gtin: finalGtin,
          batch: form.batch,
          mfd: form.mfdDate || null,
          exp: form.expiryDate,
          quantity: qty,
          printer_id: form.printerId,
          mrp: form.mrp || undefined,
          sku: form.sku || undefined,
          company: company || undefined
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        console.error('API Error Response:', data);
        setError(`Failed to generate codes: ${data.message}${data.detail ? ` - ${data.detail}` : ''}${data.hint ? ` (${data.hint})` : ''}`);
        return;
      }
      
      const result = await res.json();
      console.log('API Response:', result); // Debug log
      console.log('Items count:', result.items?.length); // Debug log
      
      const newRows: BatchRow[] = result.items.map((item: any, idx: number) => ({
        id: `b${batch.length + idx + 1}`,
        fields: {
          gtin: finalGtin,
          mfdYYMMDD: isoDateToYYMMDD(form.mfdDate),
          expiryYYMMDD: isoDateToYYMMDD(form.expiryDate),
          batch: form.batch || undefined,
          mrp: form.mrp || undefined,
          sku: form.sku || undefined,
          company: company || undefined,
          serial: item.serial || undefined
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
    if (!company) {
      setError('Company name not found. Please check your registration.');
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
          const rows = await csvToRows(csvData as string, form.printerId);
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
              <input className="mt-1 p-2 border rounded w-full" value={form.gtin} onChange={(e) => update('gtin', e.target.value)} placeholder="Leave blank to auto-generate (890...) or enter your GTIN" />
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

            <div>
              <div className="text-sm text-gray-600">Company</div>
              <div className="mt-1 p-2 border rounded w-full bg-gray-50 text-gray-700">
                {company || 'Loading from registration...'}
              </div>
            </div>

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
              if (!form.printerId) {
                setError('Please select or create a Printer ID first');
                return;
              }
              const csv = `GTIN,SKU,MFD,EXP,BATCH,MRP,COMPANY,QTY,CODE_TYPE\n,MED-001,250101,260101,BATCH001,30.00,${company || 'ABC Pharma Ltd'},100,QR\n8901234,MED-002,250101,260101,BATCH002,35.00,${company || 'XYZ Exports'},50,DATAMATRIX\n\n# Printer ID: ${form.printerId}\n# First row: GTIN left blank - will auto-generate with 890 prefix\n# Second row: GTIN with custom prefix (8901234...) - use your company prefix`;
              const blob = new Blob([csv], { type: 'text/csv' });
              saveAs(blob, `template_${form.printerId}.csv`);
            }}>Download Template</button>

            <button type="button" className="px-4 py-2 bg-indigo-600 text-white rounded ml-auto" onClick={() => { setBatch([]); }}>Clear Batch</button>
          </div>

          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            <strong>📋 CSV Upload Instructions:</strong>
            <ul className="mt-1 ml-4 list-disc space-y-1">
              <li><strong>Required before upload:</strong> Select Printer ID in the form above</li>
              <li><strong>CSV Columns:</strong> GTIN, SKU, MFD, EXP, BATCH, MRP, COMPANY, QTY, CODE_TYPE</li>
              <li><strong>GTIN:</strong> Leave blank to auto-generate (890 prefix) OR add your company prefix (3-8 digits) for custom series (e.g., 8901234...)</li>
              <li><strong>COMPANY:</strong> Your company/manufacturer/exporter name</li>
              <li><strong>Date Format:</strong> YYMMDD (e.g., 250101 = Jan 1, 2025) or YYYY-MM-DD</li>
              <li><strong>CODE_TYPE:</strong> QR or DATAMATRIX (per row)</li>
              <li><strong>QTY:</strong> Number of unique codes to generate per row</li>
              <li>Example: One CSV row with QTY=1000 generates 1000 unique codes, each with unique serial number (AI 21)</li>
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
                <div key={b.id} className="p-2 border rounded">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm flex-1">
                      <div className="font-medium">#{idx + 1} — {b.fields.gtin}</div>
                      <div className="text-xs text-gray-500">{b.fields.batch} • {b.fields.sku} • {b.fields.company}</div>
                      <div className="text-xs text-gray-400 mt-1 font-mono">{b.payload}</div>
                    </div>
                    <div className="flex gap-2 ml-2">
                      <button className="px-2 py-1 bg-slate-100 rounded text-xs" onClick={() => { navigator.clipboard?.writeText(b.payload); }}>Copy</button>
                      <button className="px-2 py-1 bg-red-50 rounded text-xs" onClick={() => setBatch((s) => s.filter((x) => x.id !== b.id))}>Remove</button>
                    </div>
                  </div>
                  <div className="flex justify-center p-2 bg-white border rounded">
                    {b.codeType === 'QR' ? (
                      <QRCodeComponent value={b.payload} size={80} />
                    ) : (
                      <DataMatrixComponent value={b.payload} size={80} />
                    )}
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
