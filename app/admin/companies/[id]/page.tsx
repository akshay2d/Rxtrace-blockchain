'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabaseClient } from '@/lib/supabase/client';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, TrendingUp, Users, FileText, Tag, X, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UsageMeter } from '@/components/usage/UsageMeter';
import { AdminConfirmDialog } from '@/components/admin/AdminConfirmDialog';
import { useDestructiveAction } from '@/lib/admin/useDestructiveAction';

type Company = {
  id: string;
  company_name: string;
  created_at: string;
  discount_type?: 'percentage' | 'flat' | null;
  discount_value?: number | null;
  discount_applies_to?: 'subscription' | 'addon' | 'both' | null;
  discount_notes?: string | null;
};

type UsageData = {
  current_period: {
    usage: Record<string, any>;
  };
  seats: {
    max_seats: number;
    used_seats: number;
    available_seats: number;
    seats_from_plan: number;
    seats_from_addons: number;
  };
  historical: Array<{
    metric_type: string;
    period_start: string;
    used_quantity: number;
  }>;
};

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  
  const [company, setCompany] = useState<Company | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [companyId]);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      
      // Fetch company with discount fields
      const { data: companyData } = await supabase
        .from('companies')
        .select('id, company_name, created_at, discount_type, discount_value, discount_applies_to, discount_notes')
        .eq('id', companyId)
        .single();

      if (companyData) {
        setCompany(companyData);
      }

      // Fetch usage data
      const usageRes = await fetch(`/api/admin/companies/${companyId}/usage`);
      const usageBody = await usageRes.json();
      if (usageBody.success) {
        setUsageData(usageBody);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading && !company) {
    return <div className="p-6">Loading...</div>;
  }

  if (!company) {
    return <div className="p-6">Company not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/companies')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{company.company_name}</h1>
            <p className="text-gray-600 text-sm mt-1">Company ID: {company.id.substring(0, 8)}...</p>
          </div>
        </div>
        <Button onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usage">
            <TrendingUp className="w-4 h-4 mr-2" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="seats">
            <Users className="w-4 h-4 mr-2" />
            Seats
          </TabsTrigger>
          <TabsTrigger value="subscription">
            <FileText className="w-4 h-4 mr-2" />
            Subscription
          </TabsTrigger>
          <TabsTrigger value="discounts">
            <Tag className="w-4 h-4 mr-2" />
            Discounts
          </TabsTrigger>
        </TabsList>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          {/* PRIORITY-3: Usage Interpretation (Collapsible) */}
          <Card>
            <CardHeader>
              <details className="group">
                <summary className="cursor-pointer list-none flex items-center justify-between">
                  <CardTitle className="text-lg">Usage Interpretation</CardTitle>
                  <span className="text-sm text-gray-500 group-open:hidden">Click to expand</span>
                  <span className="text-sm text-gray-500 hidden group-open:inline">Click to collapse</span>
                </summary>
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2">Billing Usage</h4>
                    <div className="text-sm text-gray-700 space-y-1 pl-4">
                      <p><strong>Source:</strong> billing_usage table</p>
                      <p><strong>Period:</strong> Billing period (aligned with subscription cycle)</p>
                      <p><strong>Purpose:</strong> Tracks usage for current billing cycle</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-2">Analytics Usage</h4>
                    <div className="text-sm text-gray-700 space-y-1 pl-4">
                      <p><strong>Source:</strong> usage_counters table</p>
                      <p><strong>Period:</strong> Calendar month (1st to last day of month)</p>
                      <p><strong>Purpose:</strong> Monthly aggregation for reporting and analytics</p>
                    </div>
                  </div>
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-semibold text-blue-900 mb-2">Why Numbers Differ</h4>
                    <p className="text-sm text-blue-800">
                      <strong>Billing data</strong> reflects your billing cycle (e.g., if your subscription started on the 15th, 
                      your billing period runs from the 15th of each month). 
                      <strong>Analytics data</strong> reflects monthly aggregation (always 1st to last day of calendar month). 
                      These different time windows can cause numbers to differ.
                    </p>
                  </div>
                </div>
              </details>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Period Usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {usageData?.current_period?.usage && Object.keys(usageData.current_period.usage).length > 0 ? (
                Object.entries(usageData.current_period.usage).map(([metricType, data]: [string, any]) => (
                  <UsageMeter
                    key={metricType}
                    label={metricType}
                    used={data.used}
                    limit={data.limit_value}
                    limitType={data.limit_type}
                    exceeded={data.exceeded}
                  />
                ))
              ) : (
                <p className="text-gray-500 text-sm">No usage data available</p>
              )}
            </CardContent>
          </Card>

          {/* Historical Usage */}
          {usageData?.historical && usageData.historical.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Historical Usage (Last 6 Months)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {usageData.historical.map((entry, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 border rounded">
                      <div>
                        <span className="font-semibold">{entry.metric_type}</span>
                        <span className="text-sm text-gray-600 ml-2">
                          {new Date(entry.period_start).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <Badge>{entry.used_quantity.toLocaleString('en-IN')}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Seats Tab */}
        <TabsContent value="seats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Seat Information</CardTitle>
            </CardHeader>
            <CardContent>
              {usageData?.seats ? (
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-sm text-gray-600 mb-1">Total Allowed</div>
                    <div className="text-2xl font-bold text-blue-700">{usageData.seats.max_seats}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {usageData.seats.seats_from_plan} from plan + {usageData.seats.seats_from_addons} from add-ons
                    </div>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-sm text-gray-600 mb-1">Used Seats</div>
                    <div className="text-2xl font-bold text-green-700">{usageData.seats.used_seats}</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-sm text-gray-600 mb-1">Available Seats</div>
                    <div className="text-2xl font-bold text-gray-700">{usageData.seats.available_seats}</div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No seat data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Subscription History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500 text-sm">Subscription history will be displayed here</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => router.push(`/admin/companies/${companyId}/audit`)}
              >
                View Audit Logs
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Discounts Tab */}
        <TabsContent value="discounts" className="space-y-4">
          <CompanyDiscountManager company={company} onUpdate={fetchData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CompanyDiscountManager({ company, onUpdate }: { company: Company; onUpdate: () => void }) {
  const [discountType, setDiscountType] = useState<string>(company.discount_type || '');
  const [discountValue, setDiscountValue] = useState<string>(company.discount_value?.toString() || '');
  const [discountAppliesTo, setDiscountAppliesTo] = useState<string>(company.discount_applies_to || 'both');
  const [discountNotes, setDiscountNotes] = useState<string>(company.discount_notes || '');
  const [saving, setSaving] = useState(false);
  const [removeConfirming, setRemoveConfirming] = useState(false);
  const destructive = useDestructiveAction<{ company: Company }>();

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/companies/discount', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: company.id,
          discount_type: discountType || null,
          discount_value: discountValue ? parseFloat(discountValue) : null,
          discount_applies_to: discountAppliesTo || null,
          discount_notes: discountNotes || null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert('Discount updated successfully');
        onUpdate();
      } else {
        const msg = res.status === 403 || data.error === 'Forbidden'
          ? 'Admin access required. If you were just granted admin rights, sign out and sign in again. See docs/ADMIN_ACCESS_FIX.md for how to grant admin.'
          : data.error;
        alert('Failed to update: ' + msg);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm('Are you sure you want to remove this discount? This action cannot be undone.')) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/discount?company_id=${company.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        alert('Discount removed successfully');
        setDiscountType('');
        setDiscountValue('');
        setDiscountAppliesTo('both');
        setDiscountNotes('');
        onUpdate();
      } else {
        const msg = res.status === 403 || data.error === 'Forbidden'
          ? 'Admin access required. If you were just granted admin rights, sign out and sign in again. See docs/ADMIN_ACCESS_FIX.md for how to grant admin.'
          : data.error;
        alert('Failed to remove: ' + msg);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const hasDiscount = company.discount_type && company.discount_value;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Direct Company Discount</CardTitle>
        <p className="text-sm text-gray-600 mt-1">
          Set a permanent discount for this company. This discount will be automatically applied to all purchases.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasDiscount && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-blue-900">Current Discount</p>
                <p className="text-sm text-blue-700 mt-1">
                  {company.discount_type === 'percentage' 
                    ? `${company.discount_value}% off`
                    : `₹${company.discount_value} off`}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Applies to: {company.discount_applies_to || 'both'}
                </p>
                {company.discount_notes && (
                  <p className="text-xs text-blue-600 mt-1">Notes: {company.discount_notes}</p>
                )}
              </div>
              <Button variant="destructive" size="sm" onClick={handleRemove} disabled={saving}>
                <X className="w-4 h-4 mr-1" />
                Remove
              </Button>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Discount Type</Label>
            <Select value={discountType} onValueChange={setDiscountType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage (%)</SelectItem>
                <SelectItem value="flat">Flat Amount (₹)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Discount Value</Label>
            <Input
              type="number"
              step="0.01"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === 'percentage' ? 'e.g. 20' : 'e.g. 500'}
            />
          </div>
        </div>
        <div>
          <Label>Applies To</Label>
          <Select value={discountAppliesTo} onValueChange={setDiscountAppliesTo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="subscription">Subscription Only</SelectItem>
              <SelectItem value="addon">Add-ons Only</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Notes (Optional)</Label>
          <Textarea
            value={discountNotes}
            onChange={(e) => setDiscountNotes(e.target.value)}
            placeholder="e.g. Enterprise deal, Loyalty discount, etc."
            rows={3}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving || !discountType || !discountValue}>
            <Save className="w-4 h-4 mr-2" />
            {hasDiscount ? 'Update Discount' : 'Set Discount'}
          </Button>
          {hasDiscount && (
            <Button variant="destructive" onClick={handleRemove} disabled={saving}>
              <X className="w-4 h-4 mr-2" />
              Remove Discount
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
