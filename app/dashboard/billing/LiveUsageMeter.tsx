'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, getBalanceStatus } from '@/lib/billingConfig';
import { TrendingUp, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

type LineItem = {
  label: string;
  count: number;
  rate: number;
  cost: number;
};

type CostData = {
  usage: { handsets: number; seats: number; box_scans: number; carton_scans: number; pallet_scans: number; total: number };
  line_items: LineItem[];
  total: number;
};

type LiveUsageMeterProps = {
  companyId: string;
  balance: number;
  refreshInterval?: number; // in milliseconds, default 30000 (30s)
};

export default function LiveUsageMeter({
  companyId,
  balance,
  refreshInterval = 30000,
}: LiveUsageMeterProps) {
  const [costData, setCostData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchCost = useCallback(async () => {
    if (!companyId) return;

    try {
      const res = await fetch('/api/billing/cost', { cache: 'no-store' });
      const data = await res.json();

      if (data.success && data.line_items) {
        setCostData({
          usage: data.usage ?? { handsets: 0, seats: 0, box_scans: 0, carton_scans: 0, pallet_scans: 0, total: data.total ?? 0 },
          line_items: data.line_items,
          total: data.total ?? 0,
        });
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch cost:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchCost();

    const interval = setInterval(fetchCost, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchCost, refreshInterval]);

  if (loading) {
    return (
      <Card className="border-l-4 border-l-blue-500">
        <CardContent className="p-6">
          <p className="text-sm text-gray-500">Loading usage data...</p>
        </CardContent>
      </Card>
    );
  }

  if (!costData) {
    return null;
  }

  const { line_items, total } = costData;

  const balanceStatus = getBalanceStatus(balance);
  const statusConfig = {
    healthy: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    low: { icon: AlertCircle, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    critical: { icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    frozen: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  };

  const StatusIcon = statusConfig[balanceStatus].icon;

  return (
    <Card className={`border-l-4 ${
      balanceStatus === 'healthy' ? 'border-l-green-500' :
      balanceStatus === 'low' ? 'border-l-yellow-500' :
      balanceStatus === 'critical' ? 'border-l-orange-500' :
      'border-l-red-500'
    }`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Current Month Usage (Live)
          </CardTitle>
          <span className="text-xs text-gray-500">
            Updated: {lastUpdated.toLocaleTimeString()}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-3">
          {line_items.map((item) => (
            <UsageRow
              key={item.label}
              label={item.label}
              count={item.count}
              rate={item.rate}
              cost={item.cost}
            />
          ))}
        </div>

        <div className="border-t pt-3">
          <div className="flex justify-between items-center font-semibold text-lg">
            <span>Running Total</span>
            <span className="text-blue-600">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Balance Status */}
        <div className={`p-3 rounded-lg border ${statusConfig[balanceStatus].bg} ${statusConfig[balanceStatus].border}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon className={`h-5 w-5 ${statusConfig[balanceStatus].color}`} />
              <span className="font-medium text-sm">Available Balance</span>
            </div>
            <span className={`font-bold ${statusConfig[balanceStatus].color}`}>
              {formatCurrency(balance)}
            </span>
          </div>

          {balanceStatus === 'low' && (
            <p className="text-xs text-yellow-700 mt-2">
              ⚠️ Balance is running low. Consider adding funds to avoid service interruption.
            </p>
          )}
          {balanceStatus === 'critical' && (
            <p className="text-xs text-orange-700 mt-2">
              🚨 Critical balance! Please top up immediately to prevent account freeze.
            </p>
          )}
          {balanceStatus === 'frozen' && (
            <p className="text-xs text-red-700 mt-2">
              ❌ Account frozen due to insufficient balance. Add funds to reactivate.
            </p>
          )}
        </div>

        {/* Auto-refresh indicator */}
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          Auto-updating every {refreshInterval / 1000} seconds
        </div>
      </CardContent>
    </Card>
  );
}

function UsageRow({
  label,
  count,
  rate,
  cost,
}: {
  label: string;
  count: number;
  rate: number;
  cost: number;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-700">{label}</span>
        <Badge variant="outline" className="text-xs">
          {count} × {formatCurrency(rate)}
        </Badge>
      </div>
      <span className="font-medium">{formatCurrency(cost)}</span>
    </div>
  );
}
