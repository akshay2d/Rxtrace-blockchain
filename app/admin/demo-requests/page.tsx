'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

type DemoRequest = {
  id: string;
  name: string;
  company_name: string;
  email: string;
  phone: string;
  message: string | null;
  source: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export default function DemoRequestsAdminPage() {
  const [rows, setRows] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function fetchRows() {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/demo-requests?limit=200', { cache: 'no-store' });
      const out = await res.json().catch(() => ({}));

      if (!res.ok || !out?.success) {
        setError(out?.error || 'Failed to load demo requests');
        setLoading(false);
        return;
      }

      setRows(Array.isArray(out.rows) ? out.rows : []);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demo requests');
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Demo Requests</h1>
          <p className="text-gray-600 mt-1">Submitted from the landing page “Book a Demo”.</p>
        </div>
        <Button onClick={fetchRows} disabled={loading} className="bg-orange-500 hover:bg-orange-600">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Requests ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="border rounded-lg p-4">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#0052CC]">{r.company_name}</div>
                    <div className="text-sm text-gray-800">{r.name}</div>
                    <div className="text-sm text-gray-700">{r.email} • {r.phone}</div>
                    <div className="text-xs text-gray-500 mt-1">Source: {r.source}</div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="mt-3 grid md:grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>IP: {r.ip || '—'}</div>
                  <div className="truncate">User-Agent: {r.user_agent || '—'}</div>
                </div>

                {r.message ? (
                  <div className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{r.message}</div>
                ) : null}
              </div>
            ))}

            {rows.length === 0 ? (
              <div className="text-center py-10 text-gray-500">No demo requests yet.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
