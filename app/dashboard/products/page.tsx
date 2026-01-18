'use client';

import { useCallback, useEffect, useState } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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

  const safeReadJson = useCallback(async (res: Response) => {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  }, []);

  const fetchSkus = useCallback(async () => {
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
  }, [safeReadJson]);

  useEffect(() => {
    fetchSkus();
  }, [fetchSkus]);

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

  // fetchSkus is useCallback'd above

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-1.5">SKU Master</h1>
          <p className="text-sm text-gray-600">Manage your product catalog and SKU information</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              const input = document.getElementById('sku-import-input') as HTMLInputElement | null;
              input?.click();
            }}
            disabled={importing}
            className="border-gray-300"
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
          <Button variant="outline" onClick={handleExportCsv} disabled={skus.length === 0} className="border-gray-300">
            Export CSV
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card className="p-4 border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by SKU code or product name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-800 font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-green-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-green-800 font-medium">{success}</p>
        </div>
      )}

      {/* Table */}
      <Card className="border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
              <p className="mt-4 text-sm text-gray-600">Loading SKUs...</p>
            </div>
          ) : filteredSkus.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {searchTerm ? 'No SKUs found' : 'No SKUs yet'}
              </h3>
              <p className="text-sm text-gray-600">
                {searchTerm
                  ? 'Try a different search term'
                  : 'SKUs appear here as you generate labels or import via CSV'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">SKU Code</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Product Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSkus.map((sku) => (
                    <tr key={sku.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-sm font-medium text-gray-900">{sku.sku_code}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-900">{sku.sku_name}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(sku.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(sku)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(sku)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-md transition"
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
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div>
              Showing <span className="font-medium text-gray-900">{filteredSkus.length}</span> of{' '}
              <span className="font-medium text-gray-900">{skus.length}</span> SKUs
            </div>
          </div>
        )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Edit SKU
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 rounded-md transition"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <Label htmlFor="sku-code" className="text-sm font-medium text-gray-700 mb-2 block">
                  SKU Code
                </Label>
                <Input
                  id="sku-code"
                  type="text"
                  value={formSkuCode}
                  onChange={(e) => setFormSkuCode(e.target.value)}
                  placeholder="e.g., PROD-001, SKU-12345"
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-xs text-gray-500 mt-1.5">SKU code cannot be changed after creation</p>
              </div>

              <div>
                <Label htmlFor="product-name" className="text-sm font-medium text-gray-700 mb-2 block">
                  Product Name *
                </Label>
                <Input
                  id="product-name"
                  type="text"
                  value={formSkuName}
                  onChange={(e) => setFormSkuName(e.target.value)}
                  placeholder="e.g., Ciplox 200 mg Tablet"
                  required
                />
                <p className="text-xs text-gray-500 mt-1.5">User-facing product name displayed in labels and reports</p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end bg-gray-50">
              <Button onClick={closeModal} variant="outline" disabled={submitting} className="border-gray-300">
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
