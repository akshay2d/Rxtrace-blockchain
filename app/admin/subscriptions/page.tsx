'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';
import { RefreshCw, Plus, Edit2, X, Save, Trash2, AlertCircle } from 'lucide-react';

type Plan = {
  id: string;
  name: string;
  description: string | null;
  billing_cycle: string;
  base_price: number;
  razorpay_plan_id: string | null;
  is_active: boolean;
  display_order: number;
  items: PlanItem[];
};

type PlanItem = {
  id?: string;
  label: string;
  value: string | null;
  is_visible: boolean;
  display_order: number;
  limit_value: number | null;
  limit_type: 'HARD' | 'SOFT' | 'NONE' | null;
};

export default function AdminSubscriptionsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/subscription-plans', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(plan: Partial<Plan>) {
    setSaving(true);
    try {
      const url = '/api/admin/subscription-plans';
      const method = editingPlan ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPlan ? { ...plan, id: editingPlan.id } : plan),
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        await fetchPlans();
        setShowForm(false);
        setEditingPlan(null);
      } else {
        alert('Failed to save: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(plan: Plan) {
    if (!confirm(`Are you sure you want to ${plan.is_active ? 'disable' : 'enable'} this plan?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/subscription-plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.id, is_active: !plan.is_active }),
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        await fetchPlans();
      } else {
        alert('Failed to update: ' + data.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#0052CC]">📋 Subscription Plans</h1>
          <p className="text-gray-600 mt-1">Manage subscription plans and pricing</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchPlans} disabled={loading} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {showForm && (
        <PlanForm
          plan={editingPlan}
          saving={saving}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingPlan(null); }}
        />
      )}

      {/* Empty state: no plans yet */}
      {plans.length === 0 && !loading && !showForm && (
        <Card className="border-dashed border-2 border-[#0052CC]/30 bg-[#0052CC]/5">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-lg font-medium text-gray-700 mb-1">No subscription plans yet</p>
            <p className="text-sm text-gray-500">Run the database migration to seed the 6 fixed plans (Starter Monthly/Yearly, Growth Monthly/Yearly, Enterprise Monthly/Quarterly).</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {plan.name}
                    <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                      {plan.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    {plan.razorpay_plan_id && (
                      <Badge variant="outline" className="text-xs">
                        Razorpay: {plan.razorpay_plan_id.slice(0, 12)}...
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {plan.description || 'No description'}
                    {' • '}
                    {plan.billing_cycle === 'monthly' ? 'Monthly' : plan.billing_cycle === 'quarterly' ? 'Quarterly' : 'Yearly'}
                    {' • ₹'}
                    {plan.base_price.toLocaleString('en-IN')}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditingPlan(plan); setShowForm(true); }}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleActive(plan)}
                  >
                    {plan.is_active ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <h4 className="font-semibold">Features:</h4>
                {plan.items.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {plan.items.filter(item => item.is_visible).map((item, idx) => (
                      <li key={idx}>
                        {item.label}
                        {item.value && `: ${item.value}`}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500">No features defined</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PlanForm({ plan, saving, onSave, onCancel }: { plan: Plan | null; saving?: boolean; onSave: (p: Partial<Plan>) => void; onCancel: () => void }) {
  const [name, setName] = useState(plan?.name || '');
  const [description, setDescription] = useState(plan?.description || '');
  const [billingCycle, setBillingCycle] = useState(plan?.billing_cycle || 'monthly');
  const [basePrice, setBasePrice] = useState(plan?.base_price?.toString() || '');
  const [displayOrder, setDisplayOrder] = useState(plan?.display_order?.toString() || '0');
  const [items, setItems] = useState<PlanItem[]>(
    plan?.items?.map(item => ({
      ...item,
      limit_value: item.limit_value ?? null,
      limit_type: item.limit_type ?? 'NONE'
    })) || []
  );

  function addItem() {
    setItems([...items, { label: '', value: '', is_visible: true, display_order: items.length, limit_value: null, limit_type: 'NONE' }]);
  }

  function updateItem(index: number, field: keyof PlanItem, value: any) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name,
      description,
      billing_cycle: billingCycle,
      base_price: parseFloat(basePrice),
      display_order: parseInt(displayOrder) || 0,
      items,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{plan ? 'Edit Plan' : 'New Plan'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                readOnly={!!plan}
                disabled={!!plan}
                className={plan ? 'bg-muted cursor-not-allowed' : ''}
              />
            </div>
            <div>
              <Label>Billing Cycle *</Label>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value)}
                className={`w-full border rounded-md p-2 ${plan ? 'bg-muted cursor-not-allowed' : ''}`}
                required
                disabled={!!plan}
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Base Price (₹) *</Label>
              <Input
                type="number"
                step="0.01"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Display Order</Label>
              <Input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Plan Features</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="w-3 h-3 mr-1" />
                Add Feature
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="Feature label"
                      value={item.label}
                      onChange={(e) => updateItem(idx, 'label', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Value (optional)"
                      value={item.value || ''}
                      onChange={(e) => updateItem(idx, 'value', e.target.value)}
                      className="flex-1"
                    />
                    <label className="flex items-center gap-1 text-sm whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={item.is_visible}
                        onChange={(e) => updateItem(idx, 'is_visible', e.target.checked)}
                      />
                      Visible
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeItem(idx)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex gap-2 items-center text-sm">
                    <Label className="text-xs whitespace-nowrap">Quota Limit:</Label>
                    <Input
                      type="number"
                      placeholder="Limit value"
                      value={item.limit_value ?? ''}
                      onChange={(e) => updateItem(idx, 'limit_value', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-24"
                    />
                    <select
                      value={item.limit_type || 'NONE'}
                      onChange={(e) => updateItem(idx, 'limit_type', e.target.value as 'HARD' | 'SOFT' | 'NONE')}
                      className="border rounded-md p-1 text-sm"
                    >
                      <option value="NONE">No Limit</option>
                      <option value="SOFT">Soft Limit</option>
                      <option value="HARD">Hard Limit</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
