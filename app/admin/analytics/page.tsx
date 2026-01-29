'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Download, TrendingUp, Users, DollarSign, Activity, FileText } from 'lucide-react';

type OverviewStats = {
  total_companies: number;
  trial_companies: number;
  paused_companies: number;
  cancelled_companies: number;
  mrr: number;
  arr: number;
  arpc: number;
  monthly_usage: number;
};

type UsageData = {
  aggregated: Array<{
    metric_type: string;
    period_start: string;
    total: number;
    companies: number;
  }>;
  total_events: number;
  top_companies?: Array<{
    company_name: string;
    total_usage: number;
  }>;
};

type RevenueData = {
  mrr: number;
  arr: number;
  add_on_mrr: number;
  total_mrr: number;
  revenue_by_plan: Record<string, number>;
  revenue_by_addon: Record<string, number>;
  total_refunds: number;
  active_subscriptions: number;
};

type SubscriptionData = {
  status_breakdown: Record<string, number>;
  total_subscriptions: number;
  active_subscriptions: number;
  trial_to_active_conversions: number;
  conversion_rate: number;
  churned_subscriptions: number;
  churn_rate: number;
};

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionData | null>(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    setLoading(true);
    try {
      // Fetch overview stats
      const overviewRes = await fetch('/api/admin/analytics/overview');
      const overviewData = await overviewRes.json();
      if (overviewData.success) setOverview(overviewData);

      // Fetch usage analytics
      const usageRes = await fetch('/api/admin/analytics/usage');
      const usageData = await usageRes.json();
      if (usageData.success) setUsage(usageData);

      // Fetch revenue analytics
      const revenueRes = await fetch('/api/admin/analytics/revenue');
      const revenueData = await revenueRes.json();
      if (revenueData.success) setRevenue(revenueData);

      // Fetch subscription analytics
      const subRes = await fetch('/api/admin/analytics/subscriptions');
      const subData = await subRes.json();
      if (subData.success) setSubscriptions(subData);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">📊 Analytics & Reports</h1>
          <p className="text-gray-600 mt-1">Comprehensive insights into usage, revenue, and subscriptions</p>
        </div>
        <Button onClick={fetchAllData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">
            <TrendingUp className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="usage">
            <Activity className="w-4 h-4 mr-2" />
            Usage Analytics
          </TabsTrigger>
          <TabsTrigger value="revenue">
            <DollarSign className="w-4 h-4 mr-2" />
            Revenue Analytics
          </TabsTrigger>
          <TabsTrigger value="subscriptions">
            <Users className="w-4 h-4 mr-2" />
            Subscription Analytics
          </TabsTrigger>
          <TabsTrigger value="exports">
            <FileText className="w-4 h-4 mr-2" />
            Exports
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* PRIORITY-3: Context Labels */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <span className="text-blue-600 font-semibold">ℹ️</span>
              <div className="text-sm text-blue-800 space-y-1">
                <p><strong>Revenue shown is NET</strong> (after discounts applied)</p>
                <p><strong>Usage shown is calendar-month based</strong> (from usage_counters table)</p>
                <p><strong>Billing quotas are not enforced from analytics data</strong> (analytics is read-only)</p>
              </div>
            </div>
          </div>

          {overview ? (
            <>
              {/* KPI Cards */}
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">Total Active Companies</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600">{overview.total_companies}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">Trial Companies</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-yellow-600">{overview.trial_companies}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">Paused / Cancelled</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-red-600">
                      {overview.paused_companies + overview.cancelled_companies}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">Monthly Recurring Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">₹{overview.mrr.toLocaleString('en-IN')}</div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">Annual Recurring Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-700">₹{overview.arr.toLocaleString('en-IN')}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">Avg Revenue per Company</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-700">₹{overview.arpc.toLocaleString('en-IN')}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">Monthly Usage (Aggregate)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-700">{overview.monthly_usage.toLocaleString('en-IN')}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Charts Placeholder */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>MRR Trend (Last 12 Months)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64 flex items-center justify-center text-gray-400">
                      Chart visualization - MRR trend over time
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Usage Growth Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64 flex items-center justify-center text-gray-400">
                      Chart visualization - Usage growth over time
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">Loading overview data...</div>
          )}
        </TabsContent>

        {/* Usage Analytics Tab */}
        <TabsContent value="usage" className="space-y-4">
          {/* PRIORITY-3: Context Labels */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <span className="text-blue-600 font-semibold">ℹ️</span>
              <div className="text-sm text-blue-800 space-y-1">
                <p><strong>Usage shown is calendar-month based</strong> (from usage_counters table, aggregated monthly)</p>
                <p><strong>This differs from billing usage</strong> which is based on billing period cycles</p>
                <p><strong>Billing quotas are not enforced from analytics data</strong> (analytics is read-only)</p>
              </div>
            </div>
          </div>

          {usage ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Usage by Metric Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {usage.aggregated.length > 0 ? (
                      usage.aggregated.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-4 border rounded-lg">
                          <div>
                            <div className="font-semibold">{item.metric_type}</div>
                            <div className="text-sm text-gray-600">
                              {new Date(item.period_start).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold">{item.total.toLocaleString('en-IN')}</div>
                            <div className="text-xs text-gray-500">{item.companies} companies</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-sm">No usage data available</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Companies by Usage (Current Period)</CardTitle>
                </CardHeader>
                <CardContent>
                  {usage?.top_companies && usage.top_companies.length > 0 ? (
                    <div className="space-y-2">
                      {usage.top_companies.map((company, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="w-8 h-8 flex items-center justify-center">
                              {idx + 1}
                            </Badge>
                            <span className="font-medium">{company.company_name}</span>
                          </div>
                          <Badge>{company.total_usage.toLocaleString('en-IN')}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No usage data available</p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">Loading usage data...</div>
          )}
        </TabsContent>

        {/* Revenue Analytics Tab */}
        <TabsContent value="revenue" className="space-y-4">
          {revenue ? (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">MRR</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">₹{revenue.mrr.toLocaleString('en-IN')}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">ARR</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-700">₹{revenue.arr.toLocaleString('en-IN')}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">Add-on MRR</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">₹{revenue.add_on_mrr.toLocaleString('en-IN')}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-600">Total MRR</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">₹{revenue.total_mrr.toLocaleString('en-IN')}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Revenue by Plan</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(revenue.revenue_by_plan).map(([plan, amount]) => (
                      <div key={plan} className="flex justify-between items-center p-3 border rounded">
                        <span className="font-medium">{plan}</span>
                        <Badge>₹{amount.toLocaleString('en-IN')}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Revenue by Add-on</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(revenue.revenue_by_addon).map(([addon, amount]) => (
                      <div key={addon} className="flex justify-between items-center p-3 border rounded">
                        <span className="font-medium">{addon}</span>
                        <Badge>₹{amount.toLocaleString('en-IN')}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {revenue.total_refunds > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Refunds</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold text-red-600">₹{revenue.total_refunds.toLocaleString('en-IN')}</div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">Loading revenue data...</div>
          )}
        </TabsContent>

        {/* Subscription Analytics Tab */}
        <TabsContent value="subscriptions" className="space-y-4">
          {subscriptions ? (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
                {Object.entries(subscriptions.status_breakdown).map(([status, count]) => (
                  <Card key={status}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-gray-600">{status}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{count}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Conversion Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Conversion Rate</div>
                        <div className="text-2xl font-bold text-green-600">{subscriptions.conversion_rate}%</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {subscriptions.trial_to_active_conversions} trial → active
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Churn Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Churn Rate</div>
                        <div className="text-2xl font-bold text-red-600">{subscriptions.churn_rate}%</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {subscriptions.churned_subscriptions} churned
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">Loading subscription data...</div>
          )}
        </TabsContent>

        {/* Exports Tab */}
        <TabsContent value="exports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Export Reports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <div className="font-semibold">Usage Data Export</div>
                    <div className="text-sm text-gray-600">Export usage data by company, metric, and date range</div>
                  </div>
                  <Button asChild variant="outline">
                    <a href="/api/admin/analytics/export/usage?format=csv">
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </a>
                  </Button>
                </div>
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <div className="font-semibold">Revenue Data Export</div>
                    <div className="text-sm text-gray-600">Export monthly revenue data</div>
                  </div>
                  <Button asChild variant="outline">
                    <a href="/api/admin/analytics/export/revenue?format=csv">
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </a>
                  </Button>
                </div>
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <div className="font-semibold">Subscription Status Report</div>
                    <div className="text-sm text-gray-600">Export current subscription status for all companies</div>
                  </div>
                  <Button asChild variant="outline">
                    <a href="/api/admin/analytics/export/subscriptions?format=csv">
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
