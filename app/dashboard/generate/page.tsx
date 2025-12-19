'use client';

import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

import GenerateLabel from '@/lib/generateLabel';
import { buildGs1ElementString } from '@/lib/gs1Builder';
import IssuePrinterSelector, { Printer } from '@/components/IssuePrinterSelector';
import QRCodeComponent from '@/components/custom/QRCodeComponent';
import DataMatrixComponent from '@/components/custom/DataMatrixComponent';
import { supabaseClient } from '@/lib/supabase/client';

// ---------- types ----------
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
  mfdDate?: string;
  expiryDate?: string;
  batch: string;
  mrp: string;
  sku: string;
  company: string;
  codeType: CodeType;
  quantity: number;
  printerId: string;
};

type SkuRow = { id: string; sku_code: string; sku_name: string | null };

type PackingRuleRow = {
  id: string;
  sku_id: string;
  version: number;
  strips_per_box: number;
  boxes_per_carton: number;
  cartons_per_pallet: number;
};

type BatchRow = {
  id: string;
  fields: Gs1Fields;
  payload: string;
  codeType: CodeType;
};

// ---------- helpers ----------
function generateGTIN(prefix = '890'): string {
  const remainingDigits = 13 - prefix.length;
  const random = Math.floor(Math.random() * Math.pow(10, remainingDigits))
    .toString()
    .padStart(remainingDigits, '0');
  return `${prefix}${random}`;
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

// ---------- printers ----------
function buildZplForRow(row: BatchRow) {
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

function buildEplForRow(row: BatchRow) {
  const lines = [
    'N',
    `A50,50,0,3,1,1,N,"GTIN:${row.fields.gtin}"`,
    `A50,90,0,3,1,1,N,"MFD:${row.fields.mfdYYMMDD ?? ''}"`,
    `A50,130,0,3,1,1,N,"EXP:${row.fields.expiryYYMMDD ?? ''}"`,
    `A50,170,0,3,1,1,N,"BATCH:${row.fields.batch ?? ''}"`,
    `A50,210,0,3,1,1,N,"MRP:${row.fields.mrp ?? ''}"`,
    'P1'
  ];
  return lines.join('\n') + '\n';
}

// ---------- pdf ----------
async function buildPdf(rows: BatchRow[]) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const qrcode = await import('qrcode');
  const bwipjs = await import('bwip-js');

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

      if (dataUrl) {
        doc.addImage(dataUrl, 'PNG', x, y, cellW, cellH - 10);
      }

      if (item.fields.serial) {
        doc.setFontSize(6);
        doc.text(String(item.fields.serial), x + 2, y + cellH - 2);
      }
    }
  }

  return doc;
}

// ---------- csv ----------
async function csvToRows(csvText: string, printerId: string): Promise<BatchRow[]> {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const out: BatchRow[] = [];

  for (const row of parsed.data) {
    const gtinRaw = (row['GTIN'] || row['gtin'] || '').toString().trim();
    const gtin = gtinRaw || generateGTIN();
    const mfdRaw = (row['MFD'] || row['mfd'] || '').toString().trim();
    const expRaw = (row['EXP'] || row['exp'] || '').toString().trim();
    const mrp = (row['MRP'] || row['mrp'] || '').toString().trim();
    const batch = (row['BATCH'] || row['batch'] || '').toString().trim();
    const sku = (row['SKU'] || row['sku'] || '').toString().trim();
    const companyName = (row['COMPANY'] || row['company'] || '').toString().trim();
    const qty = Math.max(1, parseInt((row['QTY'] || '1').toString(), 10) || 1);
    const rowCodeType: CodeType =
      ((row['CODE_TYPE'] || '').toString().toUpperCase() === 'DATAMATRIX') ? 'DATAMATRIX' : 'QR';

    const mfdISO = mfdRaw.length === 6 ? `20${mfdRaw.slice(0,2)}-${mfdRaw.slice(2,4)}-${mfdRaw.slice(4,6)}` : mfdRaw;
    const expISO = expRaw.length === 6 ? `20${expRaw.slice(0,2)}-${expRaw.slice(2,4)}-${expRaw.slice(4,6)}` : expRaw;

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
      throw new Error(`Failed to generate codes for SKU: ${sku}`);
    }

    const result = await res.json();
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
          company: companyName || undefined,
          serial: item.serial
        },
        payload: item.gs1,
        codeType: rowCodeType
      });
    });
  }

  return out;
}

// ---------- page ----------
export default function Page() {
  const [form, setForm] = useState<FormState>({
    gtin: '1234567890123',
    batch: '',
    mrp: '',
    sku: '',
    company: '',
    codeType: 'QR',
    quantity: 1,
    printerId: ''
  });

  const [payload, setPayload] = useState<string>();
  const [batch, setBatch] = useState<BatchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [company, setCompany] = useState<string>('');
  const [companyId, setCompanyId] = useState<string>('');
  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  const [packingRules, setPackingRules] = useState<PackingRuleRow[]>([]);
  const [selectedPackingRuleId, setSelectedPackingRuleId] = useState<string>('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabaseClient().auth.getUser();
      if (user) {
        const { data } = await supabaseClient()
          .from('companies')
          .select('id, company_name')
          .eq('user_id', user.id)
          .single();
        if (data?.company_name) {
          setCompany(data.company_name);
          setCompanyId(data.id);
          setForm(prev => ({ ...prev, company: data.company_name }));
        }
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/skus', { cache: 'no-store' });
        if (!res.ok) return;
        const out = await res.json();
        const list = (out?.skus ?? []) as SkuRow[];
        setSkus(Array.isArray(list) ? list : []);
        if (!selectedSkuId && Array.isArray(list) && list.length) {
          setSelectedSkuId(list[0].id);
        }
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sku = skus.find((s) => s.id === selectedSkuId);
    if (sku?.sku_code) {
      setForm((prev) => ({ ...prev, sku: sku.sku_code }));
      void ensureSkuMaster(sku.sku_code);
    }

    (async () => {
      if (!companyId || !selectedSkuId) {
        setPackingRules([]);
        setSelectedPackingRuleId('');
        return;
      }

      try {
        const res = await fetch(
          `/api/packing-rules?company_id=${encodeURIComponent(companyId)}&sku_id=${encodeURIComponent(selectedSkuId)}`,
          { cache: 'no-store' }
        );
        const out = await res.json();
        const rules = (out?.rules ?? []) as PackingRuleRow[];
        if (Array.isArray(rules)) {
          setPackingRules(rules);
          setSelectedPackingRuleId(rules[0]?.id ?? '');
        } else {
          setPackingRules([]);
          setSelectedPackingRuleId('');
        }
      } catch {
        setPackingRules([]);
        setSelectedPackingRuleId('');
      }
    })();
  }, [companyId, selectedSkuId, skus]);

  async function ensureSkuMaster(skuCode: string) {
    const sku_code = (skuCode || '').trim();
    if (!sku_code) return;

    try {
      await fetch('/api/skus/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku_code }),
      });
    } catch {
      // non-blocking
    }
  }

  async function fetchPrinters(): Promise<Printer[]> {
    const res = await fetch('/api/printers');
    if (res.ok) {
      const data = await res.json();
      setPrinters(data);
      return data;
    }
    return [];
  }

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(s => ({ ...s, [k]: v }));
  }

  function handleBuild() {
    try {
      void ensureSkuMaster(form.sku);
      const built = buildGs1ElementString({
        gtin: form.gtin || generateGTIN(),
        mfdYYMMDD: isoDateToYYMMDD(form.mfdDate),
        expiryYYMMDD: isoDateToYYMMDD(form.expiryDate),
        batch: form.batch || undefined,
        mrp: form.mrp || undefined,
        sku: form.sku || undefined,
        company: company || undefined
      });
      setPayload(built);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleAddToBatch() {
    if (!payload) {
      setError('Build payload first before adding to batch');
      return;
    }
    
    // Generate multiple items based on quantity
    const newRows: BatchRow[] = [];
    for (let i = 0; i < form.quantity; i++) {
      const serialNumber = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
      const itemPayload = buildGs1ElementString({
        gtin: form.gtin || generateGTIN(),
        mfdYYMMDD: isoDateToYYMMDD(form.mfdDate),
        expiryYYMMDD: isoDateToYYMMDD(form.expiryDate),
        batch: form.batch || undefined,
        mrp: form.mrp || undefined,
        sku: form.sku || undefined,
        company: company || undefined,
        serial: serialNumber
      });
      
      newRows.push({
        id: `b${batch.length + i + 1}`,
        fields: {
          gtin: form.gtin || generateGTIN(),
          mfdYYMMDD: isoDateToYYMMDD(form.mfdDate),
          expiryYYMMDD: isoDateToYYMMDD(form.expiryDate),
          batch: form.batch || undefined,
          mrp: form.mrp || undefined,
          sku: form.sku || undefined,
          company: company || undefined,
          serial: serialNumber
        },
        payload: itemPayload,
        codeType: form.codeType
      });
    }
    
    setBatch(s => [...s, ...newRows]);
    setError(null);
  }

  async function handleExportPdf() {
    if (!batch.length) return;
    const doc = await buildPdf(batch);
    saveAs(doc.output('blob'), 'labels.pdf');
  }

  async function handleExportZpl() {
    if (!batch.length) return;
    saveAs(new Blob([batch.map(buildZplForRow).join('\n')], { type: 'text/plain' }), 'labels.zpl');
  }

  async function handleExportEpl() {
    if (!batch.length) return;
    saveAs(new Blob([batch.map(buildEplForRow).join('\n')], { type: 'text/plain' }), 'labels.epl');
  }

  async function handleExportZipImages() {
    if (!batch.length) return;
    const zip = new JSZip();
    const qrcode = await import('qrcode');
    for (let i = 0; i < batch.length; i++) {
      const dataUrl = await (qrcode as any).toDataURL(batch[i].payload, { margin: 1, width: 300 });
      const blob = await (await fetch(dataUrl)).blob();
      zip.file(`label_${i + 1}.png`, blob);
    }
    saveAs(await zip.generateAsync({ type: 'blob' }), 'labels.zip');
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Label Generation</h1>
          <p className="text-slate-600">Generate GS1-compliant QR codes and DataMatrix labels for pharmaceutical products</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form Section */}
          <form className="lg:col-span-2 space-y-6" onSubmit={e => { e.preventDefault(); handleBuild(); }}>
            {/* Product Identification */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">1</span>
                Product Identification
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">GTIN (13 digits)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.gtin}
                      onChange={e => update('gtin', e.target.value)}
                      className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      placeholder="1234567890123"
                    />
                    <button
                      type="button"
                      onClick={() => update('gtin', generateGTIN())}
                      className="px-4 py-2.5 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition font-medium whitespace-nowrap"
                    >
                      Auto Generate
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Batch Number</label>
                  <input
                    type="text"
                    value={form.batch}
                    onChange={e => update('batch', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="LOT123"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">SKU</label>
                  <select
                    value={selectedSkuId}
                    onChange={e => setSelectedSkuId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
                  >
                    {skus.length === 0 && (
                      <option value="">No SKUs found</option>
                    )}
                    {skus.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sku_code}{s.sku_name ? ` - ${s.sku_name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
                  <input
                    type="text"
                    value={form.company}
                    onChange={e => update('company', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="Company Name"
                  />
                </div>
              </div>
            </div>

            {/* Date & Pricing Information */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm font-bold">2</span>
                Date & Pricing Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Manufacturing Date</label>
                  <input
                    type="date"
                    value={form.mfdDate || ''}
                    onChange={e => update('mfdDate', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Expiry Date</label>
                  <input
                    type="date"
                    value={form.expiryDate || ''}
                    onChange={e => update('expiryDate', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">MRP (₹)</label>
                  <input
                    type="text"
                    value={form.mrp}
                    onChange={e => update('mrp', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="100.00"
                  />
                </div>
              </div>
            </div>

            {/* Label Configuration */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold">3</span>
                Label Configuration
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Code Type</label>
                    <select
                      value={form.codeType}
                      onChange={e => update('codeType', e.target.value as CodeType)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
                    >
                      <option value="QR">QR Code</option>
                      <option value="DATAMATRIX">DataMatrix</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={form.quantity}
                      onChange={e => update('quantity', parseInt(e.target.value) || 1)}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Packaging Rule</label>
                  <select
                    value={selectedPackingRuleId}
                    onChange={e => setSelectedPackingRuleId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white"
                    disabled={!selectedSkuId || packingRules.length === 0}
                  >
                    {packingRules.length === 0 ? (
                      <option value="">No rule for this SKU</option>
                    ) : (
                      packingRules.map((r) => (
                        <option key={r.id} value={r.id}>
                          v{r.version}: {r.strips_per_box}/{r.boxes_per_carton}/{r.cartons_per_pallet}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Printer (Optional)</label>
                  <IssuePrinterSelector
                    printers={printers}
                    selectedPrinter={form.printerId}
                    onChange={v => update('printerId', v || '')}
                    fetchPrinters={fetchPrinters}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button type="submit" className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium shadow-sm hover:shadow-md">
                Build Payload
              </button>
              <button
                type="button"
                onClick={handleAddToBatch}
                className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium shadow-sm hover:shadow-md"
              >
                Add to Batch
              </button>
            </div>
          </form>

          {/* Preview & Batch Section */}
          <div className="lg:col-span-1 space-y-6">
            {/* Live Preview */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <h3 className="font-semibold text-slate-900">Live Preview</h3>
              </div>
              {payload ? (
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="flex items-center justify-center overflow-hidden">
                    <GenerateLabel payload={payload} codeType={form.codeType} size={240} filename={`label_${form.gtin || 'unknown'}.png`} showText />
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
                  <div className="text-slate-400 mb-2">
                    <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500">Build a payload to preview your label</p>
                </div>
              )}
            </div>

            {/* Batch Queue */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Batch Queue</h3>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">{batch.length} items</span>
              </div>

              <div className="space-y-3 max-h-80 overflow-auto mb-4">
                {batch.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-sm">No labels in batch</p>
                  </div>
                ) : (
                  batch.map((b, idx) => (
                    <div key={b.id} className="p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition bg-slate-50">
                      <div className="text-xs font-mono text-slate-600 mb-2 break-all line-clamp-2">{b.payload}</div>
                      <div className="flex justify-center py-2 bg-white rounded overflow-hidden">
                        {b.codeType === 'QR'
                          ? <QRCodeComponent value={b.payload} size={70} />
                          : <DataMatrixComponent value={b.payload} size={70} />}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {batch.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-slate-200">
                  <button 
                    className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
                    onClick={handleExportPdf}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Export PDF
                  </button>
                  <button 
                    className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium flex items-center justify-center gap-2"
                    onClick={handleExportZipImages}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export ZIP (PNGs)
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      className="px-4 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition font-medium text-sm"
                      onClick={handleExportZpl}
                    >
                      ZPL
                    </button>
                    <button 
                      className="px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition font-medium text-sm"
                      onClick={handleExportEpl}
                    >
                      EPL
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

          {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
