'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Package, Edit2, Trash2, Search, X } from 'lucide-react';

type SKU = {
  id: string;
  company_id?: string;
  sku_code: string;
  sku_name: string;
  created_at: string;
  updated_at?: string;
};

export default function ProductsPage() {
  const [skus, setSkus] = useState<SKU[]>([]);
  const [filteredSkus, setFilteredSkus] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('edit');
  const [editingSku, setEditingSku] = useState<SKU | null>(null);
  
  // Form states
  const [formSkuCode, setFormSkuCode] = useState('');
  const [formSkuName, setFormSkuName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchSkus();
  }, []);

  async function safeReadJson(res: Response) {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  }

  function downloadTextFile(filename: string, content: string, contentType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleExportCsv() {
    setError('');
    setSuccess('');
    const rows = (skus ?? []).map((s) => ({
      sku_code: s.sku_code,
      sku_name: s.sku_name,
    }));
    const csv = Papa.unparse(rows, { header: true });
    downloadTextFile('sku_master.csv', csv, 'text/csv;charset=utf-8');
  }

  async function handleImportCsvFile(file: File) {
    setError('');
    setSuccess('');
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      const rows = (parsed.data ?? []).map((r) => ({
        sku_code: (r.sku_code ?? r.SKU_CODE ?? r.sku ?? r.SKU ?? '').toString().trim(),
        sku_name: (r.sku_name ?? r.SKU_NAME ?? r.name ?? r.NAME ?? '').toString().trim(),
      }));

      const valid = rows.filter((r) => r.sku_code && r.sku_name);
      if (valid.length === 0) {
        throw new Error('CSV must include sku_code and sku_name columns');
      }

      const res = await fetch('/api/skus/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: valid }),
      });
      const out = await safeReadJson(res);
      if (!res.ok) {
        throw new Error(out?.error || 'Import failed');
      }
      setSuccess(`✅ Imported ${out?.imported ?? 0} SKUs (skipped ${out?.skipped ?? 0})`);
      fetchSkus();
    } catch (e: any) {
      setError(e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    // Filter SKUs based on search term
    if (searchTerm.trim() === '') {
      setFilteredSkus(skus);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredSkus(
        skus.filter(
          (s) =>
            s.sku_code.toLowerCase().includes(term) ||
            s.sku_name.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, skus]);

  async function fetchSkus() {
    setLoading(true);
    try {
      const res = await fetch('/api/skus', { cache: 'no-store' });
      const out = await safeReadJson(res);
      if (!res.ok) throw new Error(out?.error || 'Failed to load SKUs');
      const skusData = (out?.skus ?? []) as SKU[];
      setSkus(Array.isArray(skusData) ? skusData : []);
      setFilteredSkus(Array.isArray(skusData) ? skusData : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function openEditModal(sku: SKU) {
    setModalMode('edit');
    setEditingSku(sku);
    setFormSkuCode(sku.sku_code);
    setFormSkuName(sku.sku_name);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingSku(null);
    setFormSkuCode('');
    setFormSkuName('');
  }

  async function handleSubmit() {
    setError('');
    setSuccess('');

    if (!editingSku) return;
    
    if (!formSkuName.trim()) {
      setError('SKU Name is required');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/skus/${editingSku.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku_code: formSkuCode.trim(),
            sku_name: formSkuName.trim(),
          }),
        }
      );
      const out = await safeReadJson(res);
      if (!res.ok) throw new Error(out?.error || 'Failed to update SKU');

      setSuccess(`✅ SKU "${formSkuCode}" updated successfully`);

      closeModal();
      fetchSkus();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(sku: SKU) {
    if (!confirm(`Are you sure you want to delete SKU "${sku.sku_code}"?\n\nWarning: This may affect existing labels and packing rules.`)) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/skus/${sku.id}`, { method: 'DELETE' });
      const out = await safeReadJson(res);
      if (!res.ok) throw new Error(out?.error || 'Failed to delete SKU');
      setSuccess(`✅ SKU "${sku.sku_code}" deleted`);
      fetchSkus();
    } catch (err: any) {
      setError(`Failed to delete: ${err.message}`);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">SKU Master</h1>
                <p className="text-slate-600">Manage your product catalog</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  const input = document.getElementById('sku-import-input') as HTMLInputElement | null;
                  input?.click();
                }}
                disabled={importing}
              >
                {importing ? 'Importing…' : 'Import CSV'}
              </Button>
              <input
                id="sku-import-input"
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportCsvFile(f);
                  e.currentTarget.value = '';
                }}
              />
              <Button variant="outline" onClick={handleExportCsv} disabled={skus.length === 0}>
                Export CSV
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by SKU code, name, or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 py-6 text-lg"
            />
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

        {/* Table */}
        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
              <p className="mt-4 text-slate-600">Loading SKUs...</p>
            </div>
          ) : filteredSkus.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {searchTerm ? 'No SKUs found' : 'No SKUs yet'}
              </h3>
              <p className="text-slate-600 mb-6">
                {searchTerm
                  ? 'Try a different search term'
                  : 'SKUs appear here as you generate labels or via CSV usage'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">SKU Code</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Product Name</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Created</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredSkus.map((sku) => (
                    <tr key={sku.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <span className="font-mono font-semibold text-blue-600">{sku.sku_code}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-900">{sku.sku_name}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm">
                        {new Date(sku.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(sku)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(sku)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Stats */}
        {!loading && skus.length > 0 && (
          <div className="mt-6 flex items-center justify-between text-sm text-slate-600">
            <div>
              Showing <span className="font-semibold text-slate-900">{filteredSkus.length}</span> of{' '}
              <span className="font-semibold text-slate-900">{skus.length}</span> SKUs
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">
                Edit SKU
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  SKU Code
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={formSkuCode}
                    onChange={(e) => setFormSkuCode(e.target.value)}
                    placeholder="e.g., PROD-001, SKU-12345"
                    className="flex-1"
                    disabled
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Product Name *
                </label>
                <Input
                  type="text"
                  value={formSkuName}
                  onChange={(e) => setFormSkuName(e.target.value)}
                  placeholder="e.g., Ciplox 200 mg Tablet"
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <Button onClick={closeModal} variant="outline" disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {submitting ? 'Saving...' : 'Update SKU'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
