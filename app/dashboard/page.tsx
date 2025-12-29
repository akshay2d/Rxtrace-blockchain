'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  QrCode,
  Boxes,
  Wallet,
  Smartphone,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type DashboardStats = {
  company_id: string;
  company_name: string | null;
  total_skus: number;
  units_generated: number;
  sscc_generated: number;
  total_scans: number;
  active_handsets: number;
  wallet: {
    balance: number;
    credit_limit: number;
    status: string;
    updated_at: string | null;
  };
};

/* -----------------------------
   Small reusable KPI card
------------------------------ */
function KpiCard({
  title,
  value,
  icon: Icon,
  href,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  href?: string;
}) {
  const content = (
    <div className="bg-white border rounded-lg p-4 hover:shadow-md transition cursor-pointer">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-semibold text-blue-700 mt-1">
            {value}
          </p>
        </div>
        <Icon className="w-6 h-6 text-blue-600" />
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

/* -----------------------------
   Dashboard Page
------------------------------ */
export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/stats', { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        if (!cancelled && res.ok) {
          setStats(body as DashboardStats);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kpi = useMemo(() => {
    const dash = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('en-IN') : '—');
    const rupee = (n: number | null | undefined) => (typeof n === 'number' ? `₹${Math.round(n).toLocaleString('en-IN')}` : '—');

    return {
      totalSkus: stats ? dash(stats.total_skus) : (loading ? '—' : '0'),
      unitsGenerated: stats ? dash(stats.units_generated) : (loading ? '—' : '0'),
      ssccGenerated: stats ? dash(stats.sscc_generated) : (loading ? '—' : '0'),
      totalScans: stats ? dash(stats.total_scans) : (loading ? '—' : '0'),
      walletBalance: stats ? rupee(stats.wallet?.balance) : (loading ? '—' : '₹0'),
      activeHandsets: stats ? dash(stats.active_handsets) : (loading ? '—' : '0'),
    };
  }, [stats, loading]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-blue-700">
          Dashboard Overview
        </h1>
        <p className="text-gray-600 mt-1">
          Quick snapshot of your traceability activity
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <KpiCard
          title="Total SKUs"
          value={kpi.totalSkus}
          icon={QrCode}
          href="/dashboard/sku"
        />
        <KpiCard
          title="Units Generated"
          value={kpi.unitsGenerated}
          icon={QrCode}
        />
        <KpiCard
          title="SSCC Generated"
          value={kpi.ssccGenerated}
          icon={Boxes}
        />
        <KpiCard
          title="Total Scans"
          value={kpi.totalScans}
          icon={Activity}
          href="/dashboard/scans"
        />
        <KpiCard
          title="Wallet Balance"
          value={kpi.walletBalance}
          icon={Wallet}
          href="/dashboard/billing"
        />
        <KpiCard
          title="Active Handsets"
          value={kpi.activeHandsets}
          icon={Smartphone}
          href="/dashboard/handsets"
        />
      </div>

      {/* Charts Section (UI placeholders – wired later) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border rounded-lg p-4 h-64 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <BarChart3 className="w-8 h-8 mx-auto mb-2" />
            Label Generation Trend
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4 h-64 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Boxes className="w-8 h-8 mx-auto mb-2" />
            Labels by Level
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4 h-64 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Wallet className="w-8 h-8 mx-auto mb-2" />
            Cost Usage Distribution
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">
          Recent Activity
        </h2>

        <ul className="space-y-3 text-sm text-gray-600">
          <li>✔ SKU “Ciplox 200mg” created</li>
          <li>✔ Packaging rule applied for SKU</li>
          <li>✔ 1,000 unit labels generated</li>
          <li>✔ 100 box SSCC generated</li>
          <li>⚠ Wallet balance updated</li>
        </ul>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-blue-50 to-white border rounded-xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-bold text-blue-700">
            Ready to generate labels?
          </h3>
          <p className="text-gray-600 mt-1">
            Start generating GS1-compliant QR & DataMatrix codes
          </p>
        </div>

        <Link
          href="/dashboard/generate"
          className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-lg font-medium text-lg"
        >
          Generate Labels
        </Link>
      </div>
    </div>
  );
}
