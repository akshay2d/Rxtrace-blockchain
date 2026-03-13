'use client';

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Building2, ReceiptText, Tag, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type RevenueSummary = {
  subscription_revenue_paise: number;
  addon_revenue_paise: number;
};

type Company = {
  id: string;
  company_name: string;
  profile_completed: boolean | null;
  is_frozen: boolean | null;
  created_at: string | null;
};

type PlanSummary = {
  template: {
    id: string;
    name: string;
    billing_cycle: string;
    plan_price: number;
  };
  versions_count: number;
};

function formatInrFromPaise(value: number): string {
  const inr = Number(value || 0) / 100;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(inr);
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary>({
    subscription_revenue_paise: 0,
    addon_revenue_paise: 0,
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [addonsCount, setAddonsCount] = useState(0);
  const [discountsEnabled, setDiscountsEnabled] = useState(false);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [revenueRes, companiesRes, plansRes, addonsRes] = await Promise.all([
        fetch("/api/admin/dashboard/revenue-summary", { cache: "no-store" }),
        fetch("/api/admin/companies?page=1&page_size=20", { cache: "no-store" }),
        fetch("/api/admin/subscription-plans", { cache: "no-store" }),
        fetch("/api/admin/addons", { cache: "no-store" }),
      ]);

      const [revenueData, companiesData, plansData, addonsData] = await Promise.all([
        revenueRes.json(),
        companiesRes.json(),
        plansRes.json(),
        addonsRes.json(),
      ]);

      if (!revenueRes.ok || !revenueData?.success) throw new Error(revenueData?.message || revenueData?.error || "Failed to load revenue summary");
      if (!companiesRes.ok || !companiesData?.success) throw new Error(companiesData?.message || companiesData?.error || "Failed to load companies");
      if (!plansRes.ok || !plansData?.success) throw new Error(plansData?.message || plansData?.error || "Failed to load plans");
      if (!addonsRes.ok || !addonsData?.success) throw new Error(addonsData?.message || addonsData?.error || "Failed to load add-ons");
      setRevenue(
        revenueData.totals || {
          subscription_revenue_paise: 0,
          addon_revenue_paise: 0,
        }
      );
      setCompanies(companiesData.companies || []);
      setPlans(plansData.plans || []);
      setAddonsCount((addonsData.add_ons || []).length);
      setDiscountsEnabled(false);
    } catch (err: any) {
      setError(err?.message || "Failed to load admin dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const frozenCompanies = useMemo(() => companies.filter((c) => c.is_frozen).length, [companies]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Admin Dashboard</h1>
          <p className="text-sm text-slate-600">Revenue overview and operational snapshot</p>
        </div>
        <Button onClick={loadDashboard} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-sm text-red-700">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><ReceiptText className="h-4 w-4" /> Subscription Revenue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatInrFromPaise(revenue.subscription_revenue_paise)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" /> Add-on Revenue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{formatInrFromPaise(revenue.addon_revenue_paise)}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-sm text-slate-500">Companies (page)</div><div className="text-2xl font-semibold">{companies.length}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-slate-500">Frozen Companies</div><div className="text-2xl font-semibold">{frozenCompanies}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-slate-500">Plan Templates</div><div className="text-2xl font-semibold">{plans.length}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-slate-500">Add-ons / Discounts</div><div className="text-2xl font-semibold">{addonsCount} / {discountsEnabled ? "On" : "Deferred"}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> Recent Companies</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {companies.slice(0, 6).map((company) => (
              <div key={company.id} className="flex items-center justify-between border-b pb-2 text-sm">
                <span className="font-medium">{company.company_name}</span>
                <span className="text-slate-500">
                  {company.profile_completed ? "profile_complete" : "profile_incomplete"}
                </span>
              </div>
            ))}
            {companies.length === 0 ? <p className="text-sm text-slate-500">No companies found.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Tag className="h-4 w-4" /> Latest Billing</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">Billing module under refactor.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
