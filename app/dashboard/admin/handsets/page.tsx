'use client';

import { useEffect, useState } from 'react';
import { supabaseClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Shield, Power, Copy, Smartphone, Clock, XCircle } from 'lucide-react';

type Overview = {
  scanning_on: boolean;
  active_handsets: number;
  token: string | null;
};

type ScannerSettings = {
  activation_enabled: boolean;
  scanning_enabled: boolean;
  sscc_scanning_enabled: boolean;
  registration_enabled: boolean;
};

type Handset = {
  id: string;
  handset_id: string;
  active: boolean;
  high_scan_enabled: boolean;
  activated_at: string | null;
  deactivated_at: string | null;
  last_seen?: string | null;
  last_scan_at?: string | null;
  registration_method?: 'register-lite' | 'token';
};

export default function HandsetsAdminPage() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Overview>({
    scanning_on: false,
    active_handsets: 0,
    token: null,
  });
  const [settings, setSettings] = useState<ScannerSettings>({
    activation_enabled: true,
    scanning_enabled: true,
    sscc_scanning_enabled: true,
    registration_enabled: true,
  });
  const [handsets, setHandsets] = useState<Handset[]>([]);
  const [handsetsLoading, setHandsetsLoading] = useState(false);
  const [statistics, setStatistics] = useState<any>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);

  /** Load admin handset overview */
  async function load() {
    setError(null);
    setLoading(true);

    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();

      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const res = await fetch('/api/admin/handsets', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to load handset status');
      }

      const json = await res.json();
      setData(json);

      const settingsRes = await fetch('/api/admin/scanner-settings', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (!settingsRes.ok) {
        const text = await settingsRes.text();
        throw new Error(text || 'Failed to load scanner settings');
      }

      const settingsJson = await settingsRes.json();
      setSettings({
        activation_enabled: !!settingsJson.activation_enabled,
        scanning_enabled: !!settingsJson.scanning_enabled,
        sscc_scanning_enabled: settingsJson.sscc_scanning_enabled === undefined ? true : !!settingsJson.sscc_scanning_enabled,
        registration_enabled: settingsJson.registration_enabled === undefined ? true : !!settingsJson.registration_enabled,
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  /** Generate/rotate activation code (shared code → N handsets) */
  async function generateToken() {
    setActionLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const res = await fetch('/api/admin/handset-tokens', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to generate token');
      }

      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to generate token');
    } finally {
      setActionLoading(false);
    }
  }

  /** Enable/disable activation (controls token generation + new handset activation) */
  async function setActivationEnabled(enabled: boolean) {
    setActionLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const res = await fetch('/api/admin/scanner-settings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ activation_enabled: enabled }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to update activation setting');
      }

      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to update activation setting');
    } finally {
      setActionLoading(false);
    }
  }

  /** Stop/resume scanning (company-wide master kill switch) */
  async function setScanningEnabled(enabled: boolean) {
    setActionLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const res = await fetch('/api/admin/scanner-settings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scanning_enabled: enabled }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to update scanning setting');
      }

      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to update scanning setting');
    } finally {
      setActionLoading(false);
    }
  }

  /** Invalidate active token(s) immediately (useful if token leaked) */
  async function rotateTokenNow() {
    setActionLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const invalidateRes = await fetch('/api/admin/handset-tokens', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (!invalidateRes.ok) {
        const text = await invalidateRes.text();
        throw new Error(text || 'Failed to invalidate token');
      }

      const generateRes = await fetch('/api/admin/handset-tokens', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (!generateRes.ok) {
        const text = await generateRes.text();
        throw new Error(text || 'Failed to generate token');
      }

      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to rotate token');
    } finally {
      setActionLoading(false);
    }
  }

  /** Load handset list */
  async function loadHandsets() {
    setHandsetsLoading(true);
    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();
      if (!sessionData?.session?.access_token) return;

      const res = await fetch('/api/admin/handsets', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (res.ok) {
        const json = await res.json();
        setHandsets(json.handsets || []);
      }
    } catch (e: any) {
      console.error('Failed to load handsets:', e);
    } finally {
      setHandsetsLoading(false);
    }
  }

  /** Deactivate individual handset (does not affect seat) */
  async function deactivateHandset(handsetId: string) {
    if (!confirm(`Deactivate handset ${handsetId}? This will not affect the seat.`)) return;

    try {
      const res = await fetch('/api/handset/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handset_id: handsetId }),
      });

      if (!res.ok) throw new Error('Failed to deactivate handset');

      alert('Handset deactivated successfully. Seat remains active.');
      await loadHandsets();
      await load(); // Refresh count
    } catch (e: any) {
      alert(e.message || 'Failed to deactivate handset');
    }
  }

  async function toggleHighScan(deviceFingerprint: string, nextEnabled: boolean) {
    setActionLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();
      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const res = await fetch('/api/admin/handsets/high-scan', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device_fingerprint: deviceFingerprint, enabled: nextEnabled }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to update high-scan setting');
      }

      await loadHandsets();
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to update high-scan setting');
    } finally {
      setActionLoading(false);
    }
  }

  /** Load handset statistics */
  async function loadStatistics() {
    setStatisticsLoading(true);
    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();
      if (!sessionData?.session?.access_token) return;

      const res = await fetch('/api/admin/handsets/statistics', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (res.ok) {
        const json = await res.json();
        setStatistics(json.statistics || null);
      }
    } catch (e: any) {
      console.error('Failed to load statistics:', e);
    } finally {
      setStatisticsLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadHandsets();
    loadStatistics();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadHandsets();
      loadStatistics();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-8 text-gray-500">Loading handset control…</div>;
  }

  return (
    <main className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-semibold">Handset & Scanner Control</h1>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* SSCC Scanner Activation Info */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-medium mb-2">SSCC Scanner Activation</h2>
            <p className="text-sm text-gray-600 mb-3">
              Handsets now activate directly from the mobile app using company ID. 
              No token generation required. Users simply enter their company ID in the mobile app to activate SSCC scanning.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800 font-medium mb-1">How it works:</p>
              <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                <li>User opens mobile scanner app</li>
                <li>Enters company ID to activate</li>
                <li>App receives JWT token automatically</li>
                <li>Ready to scan SSCC codes (boxes, cartons, pallets)</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>

      {/* Scanning master switch */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Scanning</h2>
            <p className="text-sm text-gray-500">Master kill switch for scan APIs (already activated handsets)</p>
          </div>
          {settings.scanning_enabled ? (
            <Button
              variant="destructive"
              onClick={() => setScanningEnabled(false)}
              disabled={actionLoading}
              className="gap-2"
            >
              <Power className="h-4 w-4" />
              Stop scanning
            </Button>
          ) : (
            <Button
              onClick={() => setScanningEnabled(true)}
              disabled={actionLoading}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <Power className="h-4 w-4" />
              Resume scanning
            </Button>
          )}
        </div>
      </Card>

      {/* SSCC Scanning Settings */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium mb-1">SSCC Scanning Settings</h2>
            <p className="text-sm text-gray-500">Control SSCC code scanning and handset registration</p>
          </div>

          <div className="space-y-4 border-t pt-4">
            {/* SSCC Scanning Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label className="text-sm font-medium">Enable SSCC Scanning</label>
                <p className="text-xs text-gray-500 mt-1">
                  Allow handsets to scan SSCC codes (boxes, cartons, pallets). When disabled, handsets can only scan unit labels.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {settings.sscc_scanning_enabled ? (
                  <Badge variant="default" className="bg-emerald-600">Enabled</Badge>
                ) : (
                  <Badge variant="secondary">Disabled</Badge>
                )}
                <Button
                  variant={settings.sscc_scanning_enabled ? "outline" : "default"}
                  size="sm"
                  onClick={async () => {
                    setActionLoading(true);
                    setError(null);
                    try {
                      const { data: sessionData } = await supabaseClient().auth.getSession();
                      if (!sessionData?.session?.access_token) {
                        throw new Error('Not authenticated');
                      }
                      const res = await fetch('/api/admin/scanner-settings', {
                        method: 'POST',
                        headers: {
                          Authorization: `Bearer ${sessionData.session.access_token}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ sscc_scanning_enabled: !settings.sscc_scanning_enabled }),
                      });
                      if (!res.ok) throw new Error('Failed to update setting');
                      await load();
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  disabled={actionLoading}
                >
                  {settings.sscc_scanning_enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>

            {/* Registration Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label className="text-sm font-medium">Allow New Handset Registration</label>
                <p className="text-xs text-gray-500 mt-1">
                  Allow mobile apps to register new handsets using company ID. When disabled, no new handsets can be registered.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {settings.registration_enabled ? (
                  <Badge variant="default" className="bg-emerald-600">Enabled</Badge>
                ) : (
                  <Badge variant="secondary">Disabled</Badge>
                )}
                <Button
                  variant={settings.registration_enabled ? "outline" : "default"}
                  size="sm"
                  onClick={async () => {
                    setActionLoading(true);
                    setError(null);
                    try {
                      const { data: sessionData } = await supabaseClient().auth.getSession();
                      if (!sessionData?.session?.access_token) {
                        throw new Error('Not authenticated');
                      }
                      const res = await fetch('/api/admin/scanner-settings', {
                        method: 'POST',
                        headers: {
                          Authorization: `Bearer ${sessionData.session.access_token}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ registration_enabled: !settings.registration_enabled }),
                      });
                      if (!res.ok) throw new Error('Failed to update setting');
                      await load();
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  disabled={actionLoading}
                >
                  {settings.registration_enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Legacy Token Display (for backward compatibility) */}
      {data.token && (
        <Card className="p-6 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h2 className="font-medium mb-2 text-amber-900">Legacy Activation Token</h2>
              <p className="text-xs text-amber-700 mb-3">
                This token is from the old activation system. New handsets use company ID activation instead.
              </p>
              <div className="flex items-center justify-between gap-4">
                <code className="rounded bg-white border border-amber-200 px-4 py-2 text-lg font-mono font-bold text-amber-800 tracking-wider">
                  {data.token}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(data.token!)}
                  className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                  <Copy className="h-4 w-4" /> Copy
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Statistics Dashboard */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-lg">Handset Statistics</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { loadStatistics(); loadHandsets(); }}
            disabled={statisticsLoading}
          >
            <Power className={`h-4 w-4 mr-2 ${statisticsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {statisticsLoading && !statistics ? (
          <div className="text-center py-8 text-gray-500">Loading statistics...</div>
        ) : statistics ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Active Handsets */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-sm text-blue-600 font-medium mb-1">Active Handsets</div>
                <div className="text-3xl font-bold text-blue-900">{statistics.handsets?.total_active || 0}</div>
              </div>

              {/* Registered Today */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-sm text-green-600 font-medium mb-1">Registered Today</div>
                <div className="text-3xl font-bold text-green-900">{statistics.handsets?.registered_today || 0}</div>
              </div>

              {/* Registered This Week */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="text-sm text-purple-600 font-medium mb-1">This Week</div>
                <div className="text-3xl font-bold text-purple-900">{statistics.handsets?.registered_this_week || 0}</div>
              </div>

              {/* Registered This Month */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="text-sm text-orange-600 font-medium mb-1">This Month</div>
                <div className="text-3xl font-bold text-orange-900">{statistics.handsets?.registered_this_month || 0}</div>
              </div>
            </div>

            {/* SSCC Scan Statistics */}
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-sm font-medium text-gray-700 mb-4">SSCC Scan Activity</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-xs text-gray-600 mb-1">Total SSCC Scans</div>
                  <div className="text-2xl font-bold text-gray-900">{statistics.scans?.total_sscc_scans || 0}</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-xs text-gray-600 mb-1">Today</div>
                  <div className="text-2xl font-bold text-gray-900">{statistics.scans?.sscc_scans_today || 0}</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-xs text-gray-600 mb-1">This Week</div>
                  <div className="text-2xl font-bold text-gray-900">{statistics.scans?.sscc_scans_this_week || 0}</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-xs text-gray-600 mb-1">This Month</div>
                  <div className="text-2xl font-bold text-gray-900">{statistics.scans?.sscc_scans_this_month || 0}</div>
                </div>
              </div>
            </div>

            {/* Most Active Handsets */}
            {statistics.most_active_handsets && statistics.most_active_handsets.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Most Active Handsets</h3>
                <div className="space-y-2">
                  {statistics.most_active_handsets.map((handset: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                          {idx + 1}
                        </div>
                        <code className="text-sm font-mono">{handset.handset_id}</code>
                      </div>
                      <Badge variant="default">{handset.scan_count} scans</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">No statistics available</div>
        )}
      </Card>

      {/* Handset List */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-lg flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-blue-600" />
            Registered Handsets
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={loadHandsets}
            disabled={handsetsLoading}
          >
            <Power className={`h-4 w-4 mr-2 ${handsetsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {handsetsLoading && handsets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Loading handsets...
          </div>
        ) : handsets.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Smartphone className="h-16 w-16 mx-auto mb-3 opacity-20" />
            <p>No handsets registered yet</p>
            <p className="text-xs mt-1">Handsets will appear here after activation from the mobile app</p>
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
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-mono font-medium">{handset.handset_id}</div>
                        {handset.registration_method && (
                          <Badge 
                            variant={handset.registration_method === 'register-lite' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {handset.registration_method === 'register-lite' ? '📱 Mobile App' : '🔑 Token'}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1">
                        {handset.activated_at && (
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Registered: {new Date(handset.activated_at).toLocaleString('en-IN')}
                          </div>
                        )}
                        {handset.last_scan_at && (
                          <div className="text-xs text-blue-600 flex items-center gap-1 font-medium">
                            <Clock className="h-3 w-3" />
                            Last scan: {new Date(handset.last_scan_at).toLocaleString('en-IN')}
                          </div>
                        )}
                        {!handset.last_scan_at && handset.activated_at && (
                          <div className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            No scans yet
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={handset.active ? "default" : "secondary"}>
                    {handset.active ? "Active" : "Inactive"}
                  </Badge>
                  <Badge variant={handset.active ? "outline" : "secondary"}>
                    High-scan: {handset.high_scan_enabled ? 'On' : 'Off'}
                  </Badge>
                  {handset.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleHighScan(handset.handset_id, !handset.high_scan_enabled)}
                      disabled={actionLoading}
                    >
                      {handset.high_scan_enabled ? 'Disable high-scan' : 'Enable high-scan'}
                    </Button>
                  )}
                  {handset.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deactivateHandset(handset.handset_id)}
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
      </Card>
    </main>
  );
}
