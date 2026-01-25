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
};

export default function AdminSubscriptionsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/subscription-plans');
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
    try {
      const url = editingPlan ? '/api/admin/subscription-plans' : '/api/admin/subscription-plans';
      const method = editingPlan ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPlan ? { ...plan, id: editingPlan.id } : plan),
      });

      const data = await res.json();
      if (data.success) {
        await fetchPlans();
        setShowForm(false);
        setEditingPlan(null);
      } else {
        alert('Failed to save: ' + data.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
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
          <Button onClick={() => { setEditingPlan(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            New Plan
          </Button>
        </div>
      </div>

      {showForm && (
        <PlanForm
          plan={editingPlan}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingPlan(null); }}
        />
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
                    {plan.billing_cycle === 'monthly' ? 'Monthly' : 'Yearly'}
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

function PlanForm({ plan, onSave, onCancel }: { plan: Plan | null; onSave: (p: Partial<Plan>) => void; onCancel: () => void }) {
  const [name, setName] = useState(plan?.name || '');
  const [description, setDescription] = useState(plan?.description || '');
  const [billingCycle, setBillingCycle] = useState(plan?.billing_cycle || 'monthly');
  const [basePrice, setBasePrice] = useState(plan?.base_price?.toString() || '');
  const [displayOrder, setDisplayOrder] = useState(plan?.display_order?.toString() || '0');
  const [items, setItems] = useState<PlanItem[]>(plan?.items || []);

  function addItem() {
    setItems([...items, { label: '', value: '', is_visible: true, display_order: items.length }]);
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
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Billing Cycle *</Label>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value)}
                className="w-full border rounded-md p-2"
                required
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
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
                <div key={idx} className="flex gap-2 items-center">
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
                  <label className="flex items-center gap-1 text-sm">
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
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit">
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
