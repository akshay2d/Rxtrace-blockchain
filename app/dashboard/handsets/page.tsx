'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  Plus,
  RefreshCw,
  ShieldOff,
  Smartphone,
  XCircle,
} from 'lucide-react';

type Handset = {
  id: string;
  device_fingerprint: string;
  status: string;
  high_scan_enabled: boolean;
  activated_at: string | null;
  deactivated_at?: string | null;
  last_seen?: string | null;
};

type Token = {
  id: string;
  token: string;
  used: boolean;
  disabled: boolean;
  activated_at: string | null;
  activated_handset: string | null;
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString('en-IN') : '—';

export default function HandsetsPage() {
  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [handsets, setHandsets] = useState<Handset[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [handsetsLoading, setHandsetsLoading] = useState(false);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [disablingTokenId, setDisablingTokenId] = useState<string | null>(null);
  const [disablingHighScanId, setDisablingHighScanId] = useState<string | null>(null);
  const [deactivatingHandsetId, setDeactivatingHandsetId] = useState<string | null>(null);

  const handsetMap = useMemo(() => {
    const map = new Map<string, Handset>();
    handsets.forEach((handset) => map.set(handset.id, handset));
    return map;
  }, [handsets]);

  const loadHandsetsForCompany = useCallback(async (companyIdValue: string) => {
    setHandsetsLoading(true);
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('handsets')
        .select('id, device_fingerprint, status, high_scan_enabled, activated_at, deactivated_at, last_seen')
        .eq('company_id', companyIdValue)
        .order('activated_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      const normalized = (data || []).map((handset) => ({
        id: handset.id,
        device_fingerprint: handset.device_fingerprint,
        status: handset.status,
        high_scan_enabled: !!handset.high_scan_enabled,
        activated_at: handset.activated_at || null,
        deactivated_at: handset.deactivated_at || null,
        last_seen: handset.last_seen || handset.activated_at || null,
      }));

      setHandsets(normalized);
    } catch (err: any) {
      console.error('Failed to load handsets:', err);
    } finally {
      setHandsetsLoading(false);
    }
  }, []);

  const loadTokensForCompany = useCallback(async (companyIdValue: string) => {
    setTokensLoading(true);
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('handset_tokens')
        .select('id, token, used, disabled, activated_at, activated_handset')
        .eq('company_id', companyIdValue)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      const normalizedTokens: Token[] = (data || []).map((token) => ({
        id: token.id,
        token: token.token,
        used: !!token.used,
        disabled: !!token.disabled,
        activated_at: token.activated_at || null,
        activated_handset: token.activated_handset || null,
      }));

      setTokens(normalizedTokens);
    } catch (err: any) {
      console.error('Failed to load high scan tokens:', err);
    } finally {
      setTokensLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadCompanyId() {
      try {
        const supabase = supabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setError('Please sign in to manage handsets.');
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
          setError('Company not found. Complete company setup to continue.');
          return;
        }

        setCompanyId(company.id);
        setCompanyName(company.company_name || '');
        await Promise.all([
          loadHandsetsForCompany(company.id),
          loadTokensForCompany(company.id),
        ]);
      } catch (err: any) {
        setError(err.message || 'Failed to load company details');
      } finally {
        setLoading(false);
      }
    }

    loadCompanyId();
  }, [loadHandsetsForCompany, loadTokensForCompany]);

  const refreshHandsets = async () => {
    if (!companyId) return;
    await loadHandsetsForCompany(companyId);
  };

  const refreshTokens = async () => {
    if (!companyId) return;
    await loadTokensForCompany(companyId);
  };

  const refreshAll = async () => {
    await Promise.all([refreshHandsets(), refreshTokens()]);
  };

  const generateToken = async () => {
    if (!companyId) return;
    setIsGeneratingToken(true);
    try {
      const response = await fetch('/api/handset/generate-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate token');
      }
      await refreshTokens();
    } catch (err: any) {
      alert(err.message || 'Failed to generate high scan token');
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const disableToken = async (tokenValue: string) => {
    setDisablingTokenId(tokenValue);
    try {
      const response = await fetch('/api/handset/disable-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: tokenValue }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to disable token');
      }
      await refreshTokens();
    } catch (err: any) {
      alert(err.message || 'Failed to disable token');
    } finally {
      setDisablingTokenId(null);
    }
  };

  const disableHighScan = async (handsetId: string) => {
    setDisablingHighScanId(handsetId);
    try {
      const response = await fetch('/api/handset/high-scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handset_id: handsetId, enabled: false }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to disable high scan');
      }
      await refreshAll();
    } catch (err: any) {
      alert(err.message || 'Failed to disable high scan');
    } finally {
      setDisablingHighScanId(null);
    }
  };

  async function deactivateHandset(handsetId: string) {
    if (
      !confirm(
        'Are you sure you want to deactivate this handset? It will remove SSCC scanning from the device.'
      )
    )
      return;

    setDeactivatingHandsetId(handsetId);
    try {
      const res = await fetch('/api/handset/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handset_id: handsetId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to deactivate handset');
      }
      await refreshAll();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate handset');
    } finally {
      setDeactivatingHandsetId(null);
    }
  }

  const viewLinkedHandset = (token: Token) => {
    if (!token.activated_handset) return;
    const highlightId = `handset-row-${token.activated_handset}`;
    const element = document.getElementById(highlightId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-blue-300');
      window.setTimeout(() => {
        element.classList.remove('ring-2', 'ring-blue-300');
      }, 2000);
      return;
    }
    const linked = handsetMap.get(token.activated_handset);
    if (linked) {
      alert(`Handset: ${linked.device_fingerprint}`);
    } else {
      alert('Linked handset is not loaded yet');
    }
  };

  const copyCompanyId = async () => {
    if (!companyId) return;
    try {
      await navigator.clipboard.writeText(companyId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
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
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Smartphone className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-semibold">Handset Activation</h1>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-gray-500">Loading...</CardContent>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            High Scan Activation
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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            <p className="font-medium mb-1">How to activate high scan:</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>Generate a High Scan Token below.</li>
              <li>Open the RxTrace Scanner app and choose “Activate”.</li>
              <li>Paste the token into the activation field and submit.</li>
              <li>Only high scan tokens issued to your company will enable SSCC scanning.</li>
            </ol>
            <p className="text-xs text-blue-700 mt-3">
              Token status is tracked on this page; once used the token cannot be reused. Unit scanning remains public and does not require activation.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              High Scan Tokens ({tokens.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshTokens}
                disabled={tokensLoading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${tokensLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={generateToken}
                disabled={!companyId || isGeneratingToken}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Generate High Scan Token
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tokensLoading ? (
            <div className="text-center py-8 text-gray-500">Loading tokens...</div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No high scan tokens have been generated yet.</p>
              <p className="text-xs mt-1">Tokens are required to enable SSCC scanning.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="py-2">Token</th>
                    <th>Used</th>
                    <th>Disabled</th>
                    <th>Activated Device</th>
                    <th>Activated At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => {
                    const linkedHandset = token.activated_handset
                      ? handsetMap.get(token.activated_handset)
                      : undefined;

                    const deviceLabel =
                      linkedHandset?.device_fingerprint ||
                      token.activated_handset ||
                      '—';

                    return (
                      <tr key={token.id} className="border-t">
                        <td className="py-2 leading-tight font-mono">{token.token}</td>
                        <td>
                          <Badge variant={token.used ? 'destructive' : 'secondary'}>
                            {token.used ? 'Yes' : 'No'}
                          </Badge>
                        </td>
                        <td>
                          <Badge variant={token.disabled ? 'destructive' : 'secondary'}>
                            {token.disabled ? 'Yes' : 'No'}
                          </Badge>
                        </td>
                        <td>{deviceLabel}</td>
                        <td>{formatDate(token.activated_at)}</td>
                        <td className="space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              token.used ||
                              token.disabled ||
                              disablingTokenId === token.token
                            }
                            onClick={() => disableToken(token.token)}
                            className="gap-1"
                          >
                            <ShieldOff className="h-4 w-4" />
                            Disable
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!token.activated_handset}
                            onClick={() => viewLinkedHandset(token)}
                            className="gap-1"
                          >
                            <Eye className="h-4 w-4" />
                            View handset
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Active Handsets ({handsets.filter((h) => h.status === 'ACTIVE').length})
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshHandsets}
              disabled={handsetsLoading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${handsetsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {handsetsLoading && handsets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Loading handsets...</div>
          ) : handsets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Smartphone className="h-16 w-16 mx-auto mb-3 opacity-20" />
              <p>No handsets registered yet.</p>
              <p className="text-xs mt-1">Generate a token and activate a handset from the scanner app.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="py-2">Device Fingerprint</th>
                    <th>High Scan</th>
                    <th>Activated At</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {handsets.map((handset) => (
                    <tr
                      id={`handset-row-${handset.id}`}
                      key={handset.id}
                      className="border-t"
                    >
                      <td className="py-2 font-mono">{handset.device_fingerprint}</td>
                      <td>
                        <Badge variant={handset.high_scan_enabled ? 'success' : 'secondary'}>
                          {handset.high_scan_enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </td>
                      <td>{formatDate(handset.activated_at)}</td>
                      <td>
                        <Badge variant={handset.status === 'ACTIVE' ? 'default' : 'secondary'}>
                          {handset.status}
                        </Badge>
                      </td>
                      <td className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            !handset.high_scan_enabled ||
                            disablingHighScanId === handset.id
                          }
                          onClick={() => disableHighScan(handset.id)}
                          className="gap-1"
                        >
                          <ShieldOff className="h-4 w-4" />
                          Disable High Scan
                        </Button>
                        {handset.status === 'ACTIVE' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-red-600 hover:bg-red-50"
                            onClick={() => deactivateHandset(handset.id)}
                            disabled={deactivatingHandsetId === handset.id}
                          >
                            <XCircle className="h-4 w-4" />
                            Deactivate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
