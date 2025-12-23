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
};

type Handset = {
  id: string;
  handset_id: string;
  active: boolean;
  high_scan_enabled: boolean;
  activated_at: string | null;
  deactivated_at: string | null;
  last_seen?: string | null;
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
  });
  const [handsets, setHandsets] = useState<Handset[]>([]);
  const [handsetsLoading, setHandsetsLoading] = useState(false);

  const [seats, setSeats] = useState<{ id: string; active: boolean; created_at: string }[]>([]);
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [seatsActionLoading, setSeatsActionLoading] = useState(false);
  const [desiredSeatTotal, setDesiredSeatTotal] = useState<string>('');

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

  /** Load seats for this company */
  async function loadSeats() {
    setSeatsLoading(true);
    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();
      if (!sessionData?.session?.access_token) return;

      const res = await fetch('/api/admin/seats', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to load seats');
      }

      const json = await res.json();
      setSeats(json.seats || []);
    } catch (e: any) {
      console.error('Failed to load seats:', e);
    } finally {
      setSeatsLoading(false);
    }
  }

  async function updateSeatTotal() {
    setSeatsActionLoading(true);
    setError(null);
    try {
      const desired = Number(desiredSeatTotal);
      if (!Number.isFinite(desired) || !Number.isInteger(desired) || desired <= 0) {
        throw new Error('Please enter a valid seat count (whole number).');
      }

      const currentActive = seats.filter((s) => s.active).length;
      if (desired < currentActive) {
        throw new Error(
          `You already have ${currentActive} active seats. Reducing seats is not supported here.`
        );
      }

      const delta = desired - currentActive;
      if (delta === 0) {
        return;
      }

      const { data: sessionData } = await supabaseClient().auth.getSession();

      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const res = await fetch('/api/admin/seats', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ count: delta }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to allocate seats');
      }

      await loadSeats();
    } catch (e: any) {
      setError(e.message || 'Failed to allocate seats');
    } finally {
      setSeatsActionLoading(false);
    }
  }

  /** Deactivate individual seat */
  async function deactivateSeat(seatId: string) {
    if (!confirm('Deactivate this seat? Any handsets using it must be disconnected first.')) return;

    try {
      const { data: sessionData } = await supabaseClient().auth.getSession();

      if (!sessionData?.session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const res = await fetch(`/api/admin/seats?seat_id=${seatId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to deactivate seat');
      }

      alert('Seat deactivated successfully');
      await loadSeats();
    } catch (e: any) {
      alert(e.message || 'Failed to deactivate seat');
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

  useEffect(() => {
    load();
    loadHandsets();
    loadSeats();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadHandsets();
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

      {/* Master switch */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Activation Code</h2>
            <p className="text-sm text-gray-500">Generate and share one code for multiple handsets</p>
          </div>

          <div className="flex items-center gap-2">
            {settings.activation_enabled ? (
              <>
                <Button
                  onClick={generateToken}
                  disabled={actionLoading}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Power className="h-4 w-4" />
                  Generate code
                </Button>
                <Button
                  variant="outline"
                  onClick={rotateTokenNow}
                  disabled={actionLoading}
                >
                  Rotate code
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setActivationEnabled(false)}
                  disabled={actionLoading}
                >
                  Disable activation
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setActivationEnabled(true)}
                disabled={actionLoading}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <Power className="h-4 w-4" />
                Enable activation
              </Button>
            )}
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

      {/* Token */}
      <Card className="p-6">
        <h2 className="font-medium mb-2">Activation Token</h2>
        {!settings.activation_enabled ? (
          <p className="text-sm text-gray-500">Activation is disabled</p>
        ) : data.token ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <code className="rounded bg-emerald-50 border border-emerald-200 px-6 py-4 text-2xl font-mono font-bold text-emerald-700 tracking-wider">
                {data.token}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(data.token!)}
                className="gap-2"
              >
                <Copy className="h-4 w-4" /> Copy
              </Button>
            </div>
            <p className="text-xs text-gray-500">Share this token with users to activate their handsets</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No active token</p>
        )}
      </Card>

      {/* Count */}
      <Card className="p-6">
        <h2 className="font-medium">Active Handsets</h2>
        <div className="mt-2 text-4xl font-bold">
          {data.active_handsets}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Handsets currently scanning using the active token
        </p>
      </Card>

      {/* Seats */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-medium">Seats</h2>
            <p className="mt-1 text-sm text-gray-500">
              Set how many total seats your company needs.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadSeats}
            disabled={seatsLoading}
          >
            Refresh
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded border p-4">
            <div className="text-sm text-gray-500">Active seats</div>
            <div className="mt-1 text-3xl font-bold">
              {seats.filter((s) => s.active).length}
            </div>
          </div>

          <div className="rounded border p-4">
            <div className="text-sm text-gray-500">Total seats</div>
            <div className="mt-1 text-3xl font-bold">{seats.length}</div>
          </div>

          <div className="rounded border p-4">
            <label className="text-sm text-gray-500">Total seats needed</label>
            <div className="mt-2 flex gap-2">
              <Input
                type="number"
                min={1}
                value={desiredSeatTotal}
                onChange={(e) => setDesiredSeatTotal(e.target.value)}
                placeholder="e.g. 5"
              />
              <Button
                onClick={updateSeatTotal}
                disabled={seatsActionLoading || seatsLoading}
              >
                Update
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              This only increases seats (no reduction here).
            </p>
          </div>
        </div>

        {/* Individual Seats List */}
        {seats.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium mb-3">Individual Seats</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {seats.map((seat) => (
                <div
                  key={seat.id}
                  className="flex items-center justify-between p-3 border rounded hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-xs font-mono text-gray-500">
                      {seat.id.slice(0, 8)}...
                    </div>
                    <Badge variant={seat.active ? "default" : "secondary"}>
                      {seat.active ? "Active" : "Inactive"}
                    </Badge>
                    <div className="text-xs text-gray-500">
                      Created: {new Date(seat.created_at).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                  {seat.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deactivateSeat(seat.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Deactivate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
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
            <p className="text-xs mt-1">Activate scanning and use the token on a device</p>
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
                      <div className="font-mono font-medium">{handset.handset_id}</div>
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
