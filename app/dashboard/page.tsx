'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  QrCode,
  Boxes,
  Smartphone,
  Activity,
  Package,
  CheckCircle,
  XCircle,
  Copy,
  AlertCircle,
} from 'lucide-react';
import { useSubscription } from '@/lib/hooks/useSubscription';
import { UsageMeter } from '@/components/usage/UsageMeter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';
import { LabelGenerationTrend } from '@/components/charts/LabelGenerationTrend';
import { LabelsByLevel } from '@/components/charts/LabelsByLevel';
import { CostUsageChart, type AddonPrices } from '@/components/charts/CostUsageChart';
import { DashboardTrialCard } from '@/components/dashboard/DashboardTrialCard';

type DashboardStats = {
  company_id: string;
  company_name: string | null;
  total_skus: number;
  units_generated: number;
  sscc_generated: number;
  total_scans: number;
  active_seats?: number;
  active_handsets: number;
  scan_breakdown?: {
    valid_product_scans: number;
    expired_product_scans: number;
    duplicate_scans: number;
    error_scans: number;
  };
  label_generation?: {
    unit: number;
    box: number;
    carton: number;
    pallet: number;
  };
  recent_activity?: Array<{
    id: string;
    action: string;
    status: string;
    details: any;
    created_at: string;
  }>;
};

/* -----------------------------
   Small reusable KPI card
------------------------------ */
function KpiCard({
  title,
  value,
  icon: Icon,
  href,
  className,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  href?: string;
  className?: string;
}) {
  const content = (
    <div className={`bg-white border border-gray-200 rounded-lg p-5 hover:shadow-sm transition ${className || ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">
            {value}
          </p>
        </div>
        <div className="ml-4 shrink-0">
          <Icon className="w-5 h-5 text-gray-400" />
        </div>
      </div>
    </div>
  );

  return href ? <Link href={href} className="block">{content}</Link> : content;
}

/* -----------------------------
   Dashboard Page
------------------------------ */
export default function DashboardPage() {
  const { subscription, isFeatureEnabled } = useSubscription();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [usage, setUsage] = useState<Record<string, any> | null>(null);
  const [addonPrices, setAddonPrices] = useState<AddonPrices | null>(null);

  async function refreshStats(signal?: AbortSignal) {
    const res = await fetch('/api/dashboard/stats', { cache: 'no-store', signal });
    const body = await res.json().catch(() => null);
    if (res.ok) setStats(body as DashboardStats);

    // Fetch usage data
    try {
      const usageRes = await fetch('/api/user/usage', { cache: 'no-store', signal });
      const usageBody = await usageRes.json().catch(() => null);
      if (usageRes.ok && usageBody.success) {
        setUsage(usageBody.usage);
      }
    } catch (err) {
      // Non-blocking
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    (async () => {
      try {
        await refreshStats(controller.signal);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // Near-realtime dashboard counters.
    const id = window.setInterval(() => {
      refreshStats(controller.signal).catch(() => undefined);
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(id);
      if (!controller.signal.aborted) {
        try {
          controller.abort();
        } catch {
          // Ignore abort errors during cleanup
        }
      }
    };
  }, []);

  // Add-on prices for Cost Usage Chart (unit, box, carton, pallet from add_ons table)
  useEffect(() => {
    fetch('/api/billing/addon-prices', { credentials: 'include' })
      .then((res) => res.json())
      .then((body) => {
        if (body.success && body.prices) setAddonPrices(body.prices);
      })
      .catch(() => {});
  }, []);

  const kpi = useMemo(() => {
    const dash = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('en-IN') : '—');

    const labelGen = stats?.label_generation;

    return {
      totalSkus: stats ? dash(stats.total_skus) : (loading ? '—' : '0'),
      unitsGenerated: stats ? dash(stats.units_generated) : (loading ? '—' : '0'),
      ssccGenerated: stats ? dash(stats.sscc_generated) : (loading ? '—' : '0'),
      totalScans: stats ? dash(stats.total_scans) : (loading ? '—' : '0'),
      activeHandsets: stats ? dash(stats.active_handsets) : (loading ? '—' : '0'),
      activeSeats: stats ? dash(stats.active_seats ?? 0) : (loading ? '—' : '0'),

      unitLabels: labelGen ? dash(labelGen.unit) : (loading ? '—' : '0'),
      boxLabels: labelGen ? dash(labelGen.box) : (loading ? '—' : '0'),
      cartonLabels: labelGen ? dash(labelGen.carton) : (loading ? '—' : '0'),
      palletLabels: labelGen ? dash(labelGen.pallet) : (loading ? '—' : '0'),

      // Scan breakdown by expiry status
      validProductScans: stats?.scan_breakdown ? dash(stats.scan_breakdown.valid_product_scans) : (loading ? '—' : '0'),
      expiredProductScans: stats?.scan_breakdown ? dash(stats.scan_breakdown.expired_product_scans) : (loading ? '—' : '0'),
      duplicateScans: stats?.scan_breakdown ? dash(stats.scan_breakdown.duplicate_scans) : (loading ? '—' : '0'),
      errorScans: stats?.scan_breakdown ? dash(stats.scan_breakdown.error_scans) : (loading ? '—' : '0'),
    };
  }, [stats, loading]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">
          Dashboard
        </h1>
        <p className="text-gray-600 mt-1.5 text-sm">
          Overview of your traceability operations
        </p>
      </div>

      {/* Trial & Upgrade card - Start trial, Upgrade, or Billing link */}
      <DashboardTrialCard />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Scans"
          value={kpi.totalScans}
          icon={Activity}
          href="/dashboard/scans"
        />
        <KpiCard
          title="Unit Scans"
          value={kpi.unitsGenerated}
          icon={QrCode}
        />
        <KpiCard
          title="SSCC Scans"
          value={kpi.ssccGenerated}
          icon={Boxes}
        />
        <KpiCard
          title="Total SKUs"
          value={kpi.totalSkus}
          icon={Package}
          href="/dashboard/sku"
        />
      </div>

      {/* Scan Analytics */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Scan Analytics</h2>
        <p className="text-sm text-gray-600 mb-4">Product expiry status and scan breakdown</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard 
            title="Valid Product Scans" 
            value={kpi.validProductScans} 
            icon={CheckCircle}
            className="bg-green-50 border-green-200"
          />
          <KpiCard 
            title="Expired Product Scans" 
            value={kpi.expiredProductScans} 
            icon={XCircle}
            className="bg-red-50 border-red-200"
          />
          <KpiCard 
            title="Duplicate Scans" 
            value={kpi.duplicateScans} 
            icon={Copy}
            className="bg-yellow-50 border-yellow-200"
          />
          <KpiCard 
            title="Error Scans" 
            value={kpi.errorScans} 
            icon={AlertCircle}
            className="bg-gray-50 border-gray-200"
          />
        </div>
      </div>

      {/* Label Generation */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Label Generation</h2>
        <p className="text-sm text-gray-600 mb-4">Labels generated in current billing period</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Unit Labels" value={kpi.unitLabels} icon={QrCode} />
          <KpiCard title="Box Labels" value={kpi.boxLabels} icon={Boxes} />
          <KpiCard title="Carton Labels" value={kpi.cartonLabels} icon={Boxes} />
          <KpiCard title="Pallet Labels" value={kpi.palletLabels} icon={Boxes} />
        </div>
      </div>

      {/* Usage Limits */}
      {usage && Object.keys(usage).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-900">Usage & Limits</CardTitle>
            <p className="text-sm text-gray-600">Current period usage against your plan limits</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {usage.UNIT && (
              <UsageMeter
                label="Unit Labels"
                used={usage.UNIT.used}
                limit={usage.UNIT.limit_value}
                limitType={usage.UNIT.limit_type}
                exceeded={usage.UNIT.exceeded}
              />
            )}
            {usage.BOX && (
              <UsageMeter
                label="Box Labels"
                used={usage.BOX.used}
                limit={usage.BOX.limit_value}
                limitType={usage.BOX.limit_type}
                exceeded={usage.BOX.exceeded}
              />
            )}
            {usage.CARTON && (
              <UsageMeter
                label="Carton Labels"
                used={usage.CARTON.used}
                limit={usage.CARTON.limit_value}
                limitType={usage.CARTON.limit_type}
                exceeded={usage.CARTON.exceeded}
              />
            )}
            {usage.SSCC && (
              <UsageMeter
                label="SSCC Labels"
                used={usage.SSCC.used}
                limit={usage.SSCC.limit_value}
                limitType={usage.SSCC.limit_type}
                exceeded={usage.SSCC.exceeded}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Label Generation Trend</h3>
          <div className="h-48">
            <LabelGenerationTrend data={[
              { date: '5 days ago', unit: stats?.label_generation?.unit ?? 0, box: stats?.label_generation?.box ?? 0, carton: stats?.label_generation?.carton ?? 0, pallet: stats?.label_generation?.pallet ?? 0 },
            ]} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Labels by Level</h3>
          <div className="h-48">
            <LabelsByLevel data={{
              unit: stats?.label_generation?.unit ?? 0,
              box: stats?.label_generation?.box ?? 0,
              carton: stats?.label_generation?.carton ?? 0,
              pallet: stats?.label_generation?.pallet ?? 0,
            }} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Cost Usage Distribution</h3>
          <p className="text-xs text-gray-500 mb-2">Indicative cost from add-on prices (Unit / Box / Carton / Pallet)</p>
          <div className="h-48">
            <CostUsageChart
              data={{
                unit: stats?.label_generation?.unit ?? 0,
                box: stats?.label_generation?.box ?? 0,
                carton: stats?.label_generation?.carton ?? 0,
                pallet: stats?.label_generation?.pallet ?? 0,
              }}
              prices={addonPrices}
            />
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Activity
        </h2>

        {stats?.recent_activity && stats.recent_activity.length > 0 ? (
          <div className="space-y-3">
            {stats.recent_activity.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                  activity.status === 'success' ? 'bg-green-500' : 
                  activity.status === 'error' ? 'bg-red-500' : 
                  'bg-yellow-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {activity.action.replace(/_/g, ' ')}
                  </p>
                  {activity.details?.description && (
                    <p className="text-sm text-gray-600 mt-0.5">
                      {activity.details.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(activity.created_at).toLocaleString('en-IN', { 
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-4">No recent activity to display</p>
        )}
      </div>
    </div>
  );
}
