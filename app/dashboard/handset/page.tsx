'use client';

import { useEffect, useState } from 'react';
import { supabaseClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Clock, Power, RefreshCw, Shield, Copy, Check, UserPlus, UserMinus } from 'lucide-react';

type Handset = {
  id: string;
  handset_id: string;
  active: boolean;
  high_scan_enabled: boolean;
  activated_at: string | null;
  last_scan_at?: string | null;
  registration_method?: 'register-lite' | 'token';
};

export default function HandsetPage() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [handsets, setHandsets] = useState<Handset[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [copied, setCopied] = useState(false);

  /** Load company ID */
  async function loadCompany() {
    try {
      const supabase = supabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setError('Not authenticated');
        return;
      }

      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (company) {
        setCompanyId(company.id);
      } else {
        setError('Company not found');
      }
    } catch (e: any) {
      console.error('Failed to load company:', e);
      setError(e.message || 'Failed to load company');
    }
  }

  /** Load handset list for this company */
  async function loadHandsets() {
    if (!companyId) return;

    setLoading(true);
    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();
      if (!sessionData?.session?.access_token) {
        setError('Not authenticated');
        return;
      }

      const res = await fetch('/api/admin/handsets', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (res.ok) {
        const json = await res.json();
        const companyHandsets = json.handsets || [];
        setHandsets(companyHandsets);
        setActiveCount(companyHandsets.filter((h: Handset) => h.active).length);
      } else {
        const errorText = await res.text();
        setError(errorText || 'Failed to load handsets');
      }
    } catch (e: any) {
      console.error('Failed to load handsets:', e);
      setError(e.message || 'Failed to load handsets');
    } finally {
      setLoading(false);
    }
  }

  /** Deactivate handset */
  async function deactivateHandset(handsetId: string) {
    if (!confirm('Deactivate this handset? It will no longer be able to scan SSCC codes.')) return;

    setActionLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionData?.session?.access_token) {
        headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
      }

      const res = await fetch('/api/handset/deactivate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ handset_id: handsetId }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to deactivate handset');
      }

      alert('Handset deactivated successfully');
      await loadHandsets();
    } catch (e: any) {
      setError(e.message || 'Failed to deactivate handset');
      alert(e.message || 'Failed to deactivate handset');
    } finally {
      setActionLoading(false);
    }
  }

  /** Reactivate handset */
  async function activateHandset(handsetId: string) {
    if (!confirm('Reactivate this handset? It will be able to scan SSCC codes again.')) return;

    setActionLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const res = await fetch('/api/handset/reactivate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({ handset_id: handsetId }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to activate handset');
      }

      alert('Handset activated successfully');
      await loadHandsets();
    } catch (e: any) {
      setError(e.message || 'Failed to activate handset');
      alert(e.message || 'Failed to activate handset');
    } finally {
      setActionLoading(false);
    }
  }

  /** Copy company ID to clipboard (Issue) */
  async function copyCompanyId() {
    if (!companyId) return;
    try {
      await navigator.clipboard.writeText(companyId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy');
    }
  }

  useEffect(() => {
    loadCompany();
  }, []);

  useEffect(() => {
    if (!companyId) return;
    loadHandsets();
    const interval = setInterval(loadHandsets, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  if (loading && !companyId) {
    return <div className="p-8 text-gray-500">Loading...</div>;
  }

  return (
    <main className="max-w-5xl mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Smartphone className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-semibold">Handset Management</h1>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Issue: Company ID for activation */}
      <Card className="p-6 border-emerald-200 bg-emerald-50/50">
        <h2 className="text-lg font-medium mb-2 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-emerald-600" />
          Issue — Company ID for activation
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Share this company ID with users so they can activate handsets in the mobile app. No token needed.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <code className="flex-1 min-w-[200px] rounded bg-white border border-emerald-200 px-4 py-2.5 text-sm font-mono font-medium text-emerald-900">
            {companyId || '—'}
          </code>
          <Button
            variant="default"
            size="sm"
            onClick={copyCompanyId}
            disabled={!companyId}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy Company ID'}
          </Button>
        </div>
      </Card>

      {/* SSCC Scanner Activation Info */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-lg font-medium mb-2">SSCC Scanner Activation</h2>
            <p className="text-sm text-gray-600 mb-3">
              Handsets activate directly from the mobile app using your company ID. 
              No token generation required. Simply enter your company ID in the mobile app to activate SSCC scanning.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800 font-medium mb-1">How to activate:</p>
              <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                <li>Open the mobile scanner app</li>
                <li>Enter your company ID (use Copy above)</li>
                <li>App receives JWT token automatically</li>
                <li>Ready to scan SSCC codes (boxes, cartons, pallets)</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>

      {/* Active Handsets Count */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-lg">Active Handsets</h2>
            <p className="text-sm text-gray-500 mt-1">
              Handsets registered and active for SSCC scanning
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-blue-600">{activeCount}</div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadHandsets}
              disabled={loading}
              className="mt-2"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Handset List — Activate / Deactivate */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-blue-600" />
            Registered Handsets — Activate / Deactivate
          </h2>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading handsets...</div>
        ) : handsets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Smartphone className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p className="text-sm font-medium mb-1">No handsets</p>
            <p className="text-xs text-gray-500">
              Handsets will appear here after activation from the mobile app
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {handsets.map((handset) => (
              <div
                key={handset.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                        {handset.handset_id}
                      </code>
                      {handset.active ? (
                        <Badge variant="default" className="bg-green-600">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                      {handset.high_scan_enabled && (
                        <Badge variant="outline" className="border-blue-300 text-blue-700">
                          SSCC Enabled
                        </Badge>
                      )}
                      {handset.registration_method === 'register-lite' && (
                        <Badge variant="outline" className="text-xs">
                          📱 Mobile App
                        </Badge>
                      )}
                      {handset.registration_method === 'token' && (
                        <Badge variant="outline" className="text-xs">
                          🔑 Token
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-600">
                      {handset.activated_at && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            Activated: {new Date(handset.activated_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {handset.last_scan_at && (
                        <div className="flex items-center gap-1 text-blue-600">
                          <Power className="h-3 w-3" />
                          <span>
                            Last scan: {new Date(handset.last_scan_at).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {!handset.last_scan_at && (
                        <span className="text-gray-400">No scans yet</span>
                      )}
                    </div>
                  </div>

                  <div className="ml-4 flex items-center gap-2">
                    {handset.active ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deactivateHandset(handset.id)}
                        disabled={actionLoading}
                        className="text-red-600 border-red-300 hover:bg-red-50 gap-1.5"
                      >
                        <UserMinus className="h-4 w-4" />
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => activateHandset(handset.id)}
                        disabled={actionLoading}
                        className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                      >
                        <UserPlus className="h-4 w-4" />
                        Activate
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
