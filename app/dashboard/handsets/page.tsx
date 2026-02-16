'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Check,
  Plus,
  RefreshCw,
  ShieldOff,
  Smartphone,
  XCircle,
} from 'lucide-react';

const TOKENS_PER_PAGE = 10;

type Token = {
  id: string;
  tokenNumber: string;
  generatedAt: string;
  expiry: string;
  status: 'ACTIVE' | 'DISABLED';
  activationCount: number;
  maxActivations: number;
};

type HandsetRow = {
  id: string;
  deviceName: string;
  tokenNumber: string;
  activatedAt: string;
  active: boolean;
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString('en-IN') : '—';

export default function HandsetsPage() {
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokensTotal, setTokensTotal] = useState(0);
  const [tokensPage, setTokensPage] = useState(1);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [disablingTokenNumber, setDisablingTokenNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [handsets, setHandsets] = useState<HandsetRow[]>([]);
  const [handsetsLoading, setHandsetsLoading] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(tokensTotal / TOKENS_PER_PAGE));

  const hasActiveHandsets = handsets.some((handset) => handset.active);

  const loadTokens = useCallback(async () => {
    setTokensLoading(true);
    try {
      const response = await fetch(
        `/api/handset/tokens?page=${tokensPage}&limit=${TOKENS_PER_PAGE}`,
        { cache: 'no-store' }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load tokens');
      }

      setTokens(data.tokens || []);
      setTokensTotal(data.total || 0);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load tokens', err);
      setError(err.message || 'Failed to load tokens');
    } finally {
      setTokensLoading(false);
      setInitializing(false);
    }
  }, [tokensPage]);

  const loadHandsets = useCallback(async () => {
    setHandsetsLoading(true);
    try {
      const response = await fetch('/api/handset/handsets', { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load handsets');
      }

      setHandsets(
        (data.handsets || []).map((handset: any) => ({
          id: handset.id,
          deviceName: handset.deviceName,
          tokenNumber: handset.token?.tokenNumber || '—',
          activatedAt: handset.activatedAt,
          active: handset.active,
        }))
      );
    } catch (err: any) {
      console.error('Failed to load handsets', err);
      setError(err.message || 'Failed to load handsets');
    } finally {
      setHandsetsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
    loadHandsets();
  }, [loadTokens, loadHandsets]);

  const generateToken = async () => {
    setIsGeneratingToken(true);
    try {
      const response = await fetch('/api/handset/generate-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate token');
      }

      setTokensPage(1);
    } catch (err: any) {
      alert(err.message || 'Failed to generate token');
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const disableToken = async (tokenNumber: string) => {
    setDisablingTokenNumber(tokenNumber);
    try {
      const response = await fetch('/api/handset/disable-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tokenNumber }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to disable token');
      }

      await loadTokens();
      await loadHandsets();
    } catch (err: any) {
      alert(err.message || 'Failed to disable token');
    } finally {
      setDisablingTokenNumber(null);
    }
  };

  const goToPreviousPage = () => {
    if (tokensPage <= 1) return;
    setTokensPage((prev) => prev - 1);
  };

  const goToNextPage = () => {
    if (tokensPage >= totalPages) return;
    setTokensPage((prev) => prev + 1);
  };

  const paginationLabel = `Page ${tokensPage} of ${totalPages}`;

  if (initializing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Smartphone className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-semibold">Handset Token Hub</h1>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            Loading tokens...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Smartphone className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-semibold">Handset Token Hub</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            High Scan Token Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Create tokens for activating high-scan devices. Each token can be used up to 10 times and expires after 30 days.
            Use the table below to disable or review usage.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={generateToken}
              disabled={isGeneratingToken}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Generate Token
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadTokens}
              disabled={tokensLoading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${tokensLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <div className="text-xs text-gray-500">{paginationLabel}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Tokens ({tokensTotal})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-sm text-red-600 mb-3">{error}</div>
          )}
          {tokensLoading && tokens.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Loading tokens...</div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No tokens generated yet.</p>
              <p className="text-xs mt-1">Create a token to begin activating devices.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="py-2">Token Number</th>
                      <th>Generated At</th>
                      <th>Expiry</th>
                      <th>Status</th>
                      <th>Count</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((token) => (
                      <tr key={token.id} className="border-t">
                        <td className="py-2 font-mono">{token.tokenNumber}</td>
                        <td>{formatDate(token.generatedAt)}</td>
                        <td>{formatDate(token.expiry)}</td>
                        <td>
                          <Badge variant={token.status === 'ACTIVE' ? 'success' : 'secondary'}>
                            {token.status}
                          </Badge>
                        </td>
                        <td>
                          {token.activationCount} / {token.maxActivations}
                        </td>
                        <td className="space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              token.status !== 'ACTIVE' ||
                              disablingTokenNumber === token.tokenNumber
                            }
                            onClick={() => disableToken(token.tokenNumber)}
                            className="gap-1"
                          >
                            <ShieldOff className="h-4 w-4" />
                            Disable
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-600">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPreviousPage}
                  disabled={tokensPage <= 1}
                >
                  Previous
                </Button>
                <span>
                  Showing {(tokensPage - 1) * TOKENS_PER_PAGE + 1} –{' '}
                  {Math.min(tokensPage * TOKENS_PER_PAGE, tokensTotal)} of {tokensTotal}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNextPage}
                  disabled={tokensPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Check className="h-5 w-5 text-green-600" />
          Active Handsets
        </CardTitle>
        </CardHeader>
        <CardContent>
          {handsetsLoading && handsets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Loading devices...</div>
          ) : !hasActiveHandsets ? (
            <div className="text-center py-8 text-gray-500">
              <p>No active handsets yet.</p>
              <p className="text-xs mt-1">Activate a device using one of your tokens first.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="py-2">Device Name</th>
                    <th>Token</th>
                    <th>Activated At</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {handsets.map((handset) => (
                    <tr key={handset.id} className="border-t">
                      <td className="py-2 font-mono">{handset.deviceName}</td>
                      <td>{handset.tokenNumber}</td>
                      <td>{formatDate(handset.activatedAt)}</td>
                      <td>
                        <Badge variant={handset.active ? 'success' : 'secondary'}>
                          {handset.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => deactivateHandset(handset.id)}
                          disabled={!handset.active || deactivatingId === handset.id}
                        >
                          <XCircle className="h-4 w-4" />
                          Deactivate
                        </Button>
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
