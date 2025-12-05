'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

type Printer = {
  id: string;
  name?: string;
  model?: string;
  location?: string;
  active?: boolean;
};

export default function PrintersPage() {
  const router = useRouter();
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formLocation, setFormLocation] = useState('');

  useEffect(() => {
    fetchPrinters();
  }, []);

  async function fetchPrinters() {
    try {
      const res = await fetch('/api/printers');
      if (res.ok) {
        const data = await res.json();
        setPrinters(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch printers', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const id = formId.toUpperCase().trim();
    if (!/^[A-Z0-9-]{2,20}$/.test(id)) {
      setError('Printer ID must be 2-20 characters: A-Z, 0-9, and hyphens (-) only');
      return;
    }

    try {
      const res = await fetch('/api/printers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printers: [{
            id,
            name: formName || null,
            model: formModel || null,
            location: formLocation || null,
            active: true
          }]
        })
      });

      if (res.ok) {
        setSuccess(`Printer "${id}" created successfully!`);
        setFormId('');
        setFormName('');
        setFormModel('');
        setFormLocation('');
        fetchPrinters();
        
        // Redirect back to generate page after 2 seconds
        setTimeout(() => {
          router.push('/dashboard/generate');
        }, 2000);
      } else {
        const data = await res.json();
        setError(data.message || 'Failed to create printer');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <Button variant="outline" onClick={() => router.push('/dashboard/generate')}>
          ← Back to Generate
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Create New Printer</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Printer ID <span className="text-red-500">*</span>
              </label>
              <Input
                value={formId}
                onChange={(e) => setFormId(e.target.value.toUpperCase())}
                placeholder="e.g. PR-01, LINE-A, PRINTER-123"
                required
                maxLength={20}
              />
              <p className="text-xs text-gray-500 mt-1">
                Must be 2-20 characters: uppercase letters (A-Z), numbers (0-9), and hyphens (-) only
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Printer Name (optional)</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Production Line A"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Model (optional)</label>
              <Input
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
                placeholder="e.g. Zebra ZT230"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Location (optional)</label>
              <Input
                value={formLocation}
                onChange={(e) => setFormLocation(e.target.value)}
                placeholder="e.g. Factory Floor 2"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                {success}
              </div>
            )}

            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
              Create Printer
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Printers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading printers...</div>
          ) : printers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No printers found. Create your first printer above.
            </div>
          ) : (
            <div className="space-y-2">
              {printers.map((p) => (
                <div
                  key={p.id}
                  className="p-3 border rounded bg-white hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{p.id}</div>
                      {p.name && <div className="text-sm text-gray-600">{p.name}</div>}
                      {p.model && <div className="text-xs text-gray-500">Model: {p.model}</div>}
                      {p.location && <div className="text-xs text-gray-500">Location: {p.location}</div>}
                    </div>
                    <div className={`px-2 py-1 rounded text-xs ${p.active !== false ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {p.active !== false ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
