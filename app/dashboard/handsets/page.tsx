'use client';

import { useEffect, useState } from 'react';
import { supabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Smartphone, AlertCircle, RefreshCw, XCircle, Clock } from 'lucide-react';

type Handset = {
  id: string;
  handset_id: string;
  active: boolean;
  high_scan_enabled: boolean;
  activated_at: string | null;
  deactivated_at: string | null;
  last_seen?: string | null;
};

export default function HandsetsPage() {
  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handsets, setHandsets] = useState<Handset[]>([]);
  const [handsetsLoading, setHandsetsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function loadCompanyId() {
      try {
        const supabase = supabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setError('Please sign in to view your Company ID');
          setLoading(false);
          return;
        }

        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('id, company_name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (companyError) {
          throw new Error(companyError.message);
        }

        if (!company) {
          setError('Company not found. Please complete company setup first.');
          setLoading(false);
          return;
        }

        setCompanyId(company.id);
        setCompanyName(company.company_name || '');
        // Load handsets after company ID is set
        if (company.id) {
          loadHandsetsForCompany(company.id);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load Company ID');
      } finally {
        setLoading(false);
      }
    }

    async function loadHandsetsForCompany(companyId: string) {
      setHandsetsLoading(true);
      try {
        const supabase = supabaseClient();
        const { data, error } = await supabase
          .from('handsets')
          .select('id, device_fingerprint, status, high_scan_enabled, activated_at, deactivated_at, last_seen')
          .eq('company_id', companyId)
          .order('activated_at', { ascending: false });

        if (error) {
          console.error('Failed to load handsets:', error);
          return;
        }

        // Transform to match frontend expectations
        const transformedHandsets = (data || []).map(h => ({
          id: h.id,
          handset_id: h.device_fingerprint || h.id,
          active: h.status === 'ACTIVE',
          high_scan_enabled: !!h.high_scan_enabled,
          activated_at: h.activated_at || null,
          deactivated_at: h.deactivated_at || null,
          last_seen: h.last_seen || h.activated_at || null,
        }));

        setHandsets(transformedHandsets);
      } catch (err: any) {
        console.error('Failed to load handsets:', err);
      } finally {
        setHandsetsLoading(false);
      }
    }

    loadCompanyId();
  }, []);

  async function loadHandsets() {
    if (!companyId) return;
    
    setHandsetsLoading(true);
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('handsets')
        .select('id, device_fingerprint, status, high_scan_enabled, activated_at, deactivated_at, last_seen')
        .eq('company_id', companyId)
        .order('activated_at', { ascending: false });

      if (error) {
        console.error('Failed to load handsets:', error);
        return;
      }

      // Transform to match frontend expectations
      const transformedHandsets = (data || []).map(h => ({
        id: h.id,
        handset_id: h.device_fingerprint || h.id,
        active: h.status === 'ACTIVE',
        high_scan_enabled: !!h.high_scan_enabled,
        activated_at: h.activated_at || null,
        deactivated_at: h.deactivated_at || null,
        last_seen: h.last_seen || h.activated_at || null,
      }));

      setHandsets(transformedHandsets);
    } catch (err: any) {
      console.error('Failed to load handsets:', err);
    } finally {
      setHandsetsLoading(false);
    }
  }

  async function deactivateHandset(handsetId: string) {
    if (!confirm(`Are you sure you want to deactivate this handset? This will disable SSCC scanning on this device.`)) return;

    setActionLoading(true);
    try {
      const res = await fetch('/api/handset/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handset_id: handsetId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to deactivate handset');
      }

      alert('Handset deactivated successfully.');
      await loadHandsets();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate handset');
    } finally {
      setActionLoading(false);
    }
  }

  async function copyCompanyId() {
    if (!companyId) return;
    
    try {
      await navigator.clipboard.writeText(companyId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = companyId;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Smartphone className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-semibold">Handset Activation</h1>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            Loading...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Smartphone className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-semibold">Handset Activation</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3 text-red-600">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <div>
                <p className="font-medium">Error</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Smartphone className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-semibold">Handset Activation</h1>
      </div>

      {/* Company ID Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Your Company ID
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {companyName && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Company Name</p>
              <p className="font-semibold text-lg">{companyName}</p>
            </div>
          )}
          
          <div>
            <p className="text-sm text-gray-600 mb-2">Company ID (UUID)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-gray-100 border border-gray-300 px-4 py-3 text-sm font-mono break-all">
                {companyId}
              </code>
              <Button
                onClick={copyCompanyId}
                variant="outline"
                size="sm"
                className="gap-2 shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-medium mb-2">How to activate your handset:</p>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Open the RxTrace Scanner app on your device</li>
              <li>Tap the "Activate" button (🔑) in the top-right corner</li>
              <li>Paste your Company ID in the activation field</li>
              <li>Tap "Activate" to register your device</li>
              <li>Once activated, you'll see "SSCC ready" status</li>
            </ol>
            <p className="text-xs text-blue-700 mt-3">
              <strong>Note:</strong> Unit label scanning works without activation (free). Activation is only required for SSCC (container-level) scanning.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>About Handset Activation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-medium mb-1">Unit Label Scanning (Free)</p>
            <p className="text-gray-600">Works immediately after app installation. No activation needed. Works offline and syncs when online.</p>
          </div>
          <div>
            <p className="font-medium mb-1">SSCC Scanning (Requires Activation)</p>
            <p className="text-gray-600">Container-level codes for boxes, cartons, and pallets. Requires activation with Company ID. Charged per scan based on container type.</p>
          </div>
          <div className="pt-3 border-t">
            <p className="text-gray-600">
              <strong>Need help?</strong> Visit <a href="/dashboard/help" className="text-blue-600 hover:underline">Help & Support</a> for detailed instructions.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Active Handsets List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Active Handsets ({handsets.filter(h => h.active).length})
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={loadHandsets}
              disabled={handsetsLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${handsetsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {handsetsLoading && handsets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Loading handsets...
            </div>
          ) : handsets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Smartphone className="h-16 w-16 mx-auto mb-3 opacity-20" />
              <p>No handsets registered yet</p>
              <p className="text-xs mt-1">Activate a handset using your Company ID in the scanner app</p>
            </div>
          ) : (
            <div className="space-y-2">
              {handsets.map((handset) => (
                <div
                  key={handset.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="font-mono font-medium text-sm">{handset.handset_id}</div>
                        {handset.activated_at && (
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" />
                            Activated: {new Date(handset.activated_at).toLocaleString('en-IN')}
                          </div>
                        )}
                        {handset.last_seen && (
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" />
                            Last seen: {new Date(handset.last_seen).toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={handset.active ? "default" : "secondary"}>
                      {handset.active ? "Active" : "Inactive"}
                    </Badge>
                    {handset.active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deactivateHandset(handset.id)}
                        disabled={actionLoading}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Deactivate
                      </Button>
                    )}
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
