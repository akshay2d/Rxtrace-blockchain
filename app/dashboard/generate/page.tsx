'use client';

import React, { useState } from 'react';
import GenerateLabel from '@/lib/generateLabel'; // adjust path if needed
import { buildGs1ElementString } from '@/lib/gs1Builder'; // adjust path if needed

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

type FormState = {
  gtin: string;
  mfdYYMMDD: string;
  expiryYYMMDD: string;
  batch: string;
  mrp: string;
  sku: string;
  company: string;
  codeType: 'QR' | 'DATAMATRIX';
};

export default function Page() {
  const [form, setForm] = useState<FormState>({
    gtin: '1234567890123',
    mfdYYMMDD: '',
    expiryYYMMDD: '',
    batch: '',
    mrp: '',
    sku: '',
    company: '',
    codeType: 'QR'
  });

  const [payload, setPayload] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  function handleBuild(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    try {
      // Build using canonical builder. Pass only fields used by builder.
      const fields: Gs1Fields = {
        gtin: form.gtin,
        mfdYYMMDD: form.mfdYYMMDD || undefined,
        expiryYYMMDD: form.expiryYYMMDD || undefined,
        batch: form.batch || undefined,
        mrp: form.mrp || undefined,
        sku: form.sku || undefined,
        company: form.company || undefined
      };
      const built = buildGs1ElementString(fields);
      setPayload(built);
    } catch (err: any) {
      setPayload(undefined);
      setError(err?.message ?? String(err));
    }
  }

  return (
    <main style={{ padding: 20, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 12 }}>Generate Label</h1>

      <form onSubmit={handleBuild} style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            GTIN (14 digits or shorter — will be padded):
            <input value={form.gtin} onChange={(e) => update('gtin', e.target.value)} style={inputStyle} />
          </label>

          <label>
            Manufacture Date (YYMMDD)
            <input value={form.mfdYYMMDD} onChange={(e) => update('mfdYYMMDD', e.target.value)} style={inputStyle} placeholder="e.g. 250101" />
          </label>

          <label>
            Expiry Date (YYMMDD)
            <input value={form.expiryYYMMDD} onChange={(e) => update('expiryYYMMDD', e.target.value)} style={inputStyle} placeholder="e.g. 260101" />
          </label>

          <label>
            Batch / Lot
            <input value={form.batch} onChange={(e) => update('batch', e.target.value)} style={inputStyle} />
          </label>

          <label>
            MRP (rupees, e.g. 30 or 30.00)
            <input value={form.mrp} onChange={(e) => update('mrp', e.target.value)} style={inputStyle} />
          </label>

          <label>
            SKU
            <input value={form.sku} onChange={(e) => update('sku', e.target.value)} style={inputStyle} />
          </label>

          <label>
            Company
            <input value={form.company} onChange={(e) => update('company', e.target.value)} style={inputStyle} />
          </label>

          <label>
            Code Type
            <select value={form.codeType} onChange={(e) => update('codeType', e.target.value as any)} style={inputStyle}>
              <option value="QR">QR</option>
              <option value="DATAMATRIX">DataMatrix</option>
            </select>
          </label>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" style={primaryButtonStyle}>Build & Preview</button>
            <button type="button" onClick={() => { setForm({ gtin: '', mfdYYMMDD: '', expiryYYMMDD: '', batch: '', mrp: '', sku: '', company: '', codeType: 'QR' }); setPayload(undefined); setError(null); }} style={secondaryButtonStyle}>Reset</button>
          </div>

          {error && <div style={{ color: 'crimson', marginTop: 8 }}>{error}</div>}
        </div>

        <div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Preview</div>

          {payload ? (
            <GenerateLabel
              payload={payload}
              codeType={form.codeType}
              size={320}
              filename={`label_${form.gtin || 'unknown'}.png`}
              showText={true}
            />
          ) : (
            <div style={{ padding: 16, border: '1px dashed #e5e7eb', borderRadius: 8 }}>No payload yet. Fill form and click <strong>Build & Preview</strong>.</div>
          )}

          <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
            <div>GS1 ordering: 01 → 17 → 11 → 10 → 91 → 92 → 93</div>
            <div>MRP is encoded in rupees (two decimals), not paise.</div>
          </div>
        </div>
      </form>
    </main>
  );
}

// small inline styles
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  marginTop: 6,
  borderRadius: 6,
  border: '1px solid #e5e7eb',
  fontSize: 14
};

const primaryButtonStyle: React.CSSProperties = {
  background: '#111827',
  color: '#fff',
  border: 'none',
  padding: '8px 12px',
  borderRadius: 6,
  cursor: 'pointer'
};

const secondaryButtonStyle: React.CSSProperties = {
  background: '#fff',
  color: '#111827',
  border: '1px solid #e5e7eb',
  padding: '8px 12px',
  borderRadius: 6,
  cursor: 'pointer'
};
