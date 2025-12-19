'use client';

import { useEffect, useState } from 'react';
import WalletSummaryCard from './WalletSummaryCard';
import LiveUsageMeter from './LiveUsageMeter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function BillingPage() {
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string>('');

  async function fetchWallet() {
    setLoading(true);
    setMessage(null);
    try {
      if (!companyId) {
        throw new Error('Company ID not found. Please refresh the page.');
      }

      const res = await fetch(`/api/billing/wallet?company_id=${companyId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load wallet');
      setWallet(body);
    } catch (err: any) {
      setMessage(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadCompany() {
    try {
      const { supabaseClient } = await import('@/lib/supabase/client');
      const { data: { user } } = await supabaseClient().auth.getUser();
      
      if (!user) {
        setMessage('Please log in to view billing information');
        return;
      }

      const { data: company } = await supabaseClient()
        .from('companies')
        .select('id, company_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (company?.id) {
        setCompanyId(company.id);
      } else {
        setMessage('Company profile not found. Please complete your registration.');
      }
    } catch (err: any) {
      setMessage(err.message || 'Failed to load company information');
    }
  }

  async function addFunds() {
    setMessage(null);
    if (!amount || Number(amount) <= 0) {
      setMessage('Enter a valid amount');
      return;
    }

    if (!companyId) {
      setMessage('Company ID not found. Please refresh the page.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/billing/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          op: 'TOPUP',
          amount: Number(amount),
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Top-up failed');

      setAmount('');
      setMessage('✅ Funds added successfully!');
      await fetchWallet(); // real-time refresh
    } catch (err: any) {
      setMessage(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCompany();
  }, []);

  useEffect(() => {
    if (companyId) {
      fetchWallet();
    }
  }, [companyId]);

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Billing & Usage</h1>

      {message && (
        <div className={`p-4 rounded-lg border ${
          message.includes('✅') 
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {message}
        </div>
      )}

      {/* Wallet Summary */}
      {wallet && (
        <WalletSummaryCard
          balance={wallet.balance}
          creditLimit={wallet.credit_limit}
          status={wallet.status}
          companyName={wallet.company_name}
        />
      )}

      {/* Live Usage Meter */}
      {companyId && wallet && (
        <LiveUsageMeter
          companyId={companyId}
          balance={wallet.balance}
          refreshInterval={30000}
        />
      )}

      {/* Add Funds */}
      <Card>
        <CardHeader>
          <CardTitle>Add Funds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="number"
            placeholder="Amount (₹)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="1"
            disabled={loading}
          />
          <Button 
            onClick={addFunds} 
            disabled={loading || !companyId}
            className="w-full"
          >
            {loading ? 'Processing...' : 'Add Balance'}
          </Button>
          <p className="text-xs text-gray-500">
            Funds are added instantly. Charges are applied automatically on usage.
          </p>
        </CardContent>
      </Card>

      {loading && !wallet && <div className="text-sm text-gray-500">Loading wallet information…</div>}
    </div>
  );
}
