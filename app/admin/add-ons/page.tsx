'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, Edit2, X, Save } from 'lucide-react';

type AddOn = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  recurring: boolean;
  is_active: boolean;
  display_order: number;
};

export default function AdminAddOnsPage() {
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingAddOn, setEditingAddOn] = useState<AddOn | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchAddOns();
  }, []);

  async function fetchAddOns() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/add-ons');
      const data = await res.json();
      if (data.success) {
        setAddOns(data.add_ons || []);
      }
    } catch (err) {
      console.error('Failed to fetch add-ons:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(addOn: Partial<AddOn>) {
    try {
      const url = '/api/admin/add-ons';
      const method = editingAddOn ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingAddOn ? { ...addOn, id: editingAddOn.id } : addOn),
      });

      const data = await res.json();
      if (data.success) {
        await fetchAddOns();
        setShowForm(false);
        setEditingAddOn(null);
      } else {
        alert('Failed to save: ' + data.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  }

  async function handleToggleActive(addOn: AddOn) {
    if (!confirm(`Are you sure you want to ${addOn.is_active ? 'disable' : 'enable'} this add-on?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/add-ons', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: addOn.id, is_active: !addOn.is_active }),
      });

      const data = await res.json();
      if (data.success) {
        await fetchAddOns();
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
          <h1 className="text-3xl font-bold text-[#0052CC]">🔧 Add-ons</h1>
          <p className="text-gray-600 mt-1">Manage add-ons and pricing</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchAddOns} disabled={loading} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => { setEditingAddOn(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            New Add-on
          </Button>
        </div>
      </div>

      {showForm && (
        <AddOnForm
          addOn={editingAddOn}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingAddOn(null); }}
        />
      )}

      <div className="grid gap-4">
        {addOns.map((addOn) => (
          <Card key={addOn.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {addOn.name}
                    <Badge variant={addOn.is_active ? 'default' : 'secondary'}>
                      {addOn.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    {addOn.recurring && <Badge variant="outline">Recurring</Badge>}
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    {addOn.description || 'No description'}
                    {' • ₹'}
                    {addOn.price.toLocaleString('en-IN')}
                    {' / '}
                    {addOn.unit}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditingAddOn(addOn); setShowForm(true); }}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleActive(addOn)}
                  >
                    {addOn.is_active ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AddOnForm({ addOn, onSave, onCancel }: { addOn: AddOn | null; onSave: (a: Partial<AddOn>) => void; onCancel: () => void }) {
  const [name, setName] = useState(addOn?.name || '');
  const [description, setDescription] = useState(addOn?.description || '');
  const [price, setPrice] = useState(addOn?.price?.toString() || '');
  const [unit, setUnit] = useState(addOn?.unit || '');
  const [recurring, setRecurring] = useState(addOn?.recurring || false);
  const [displayOrder, setDisplayOrder] = useState(addOn?.display_order?.toString() || '0');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name,
      description,
      price: parseFloat(price),
      unit,
      recurring,
      display_order: parseInt(displayOrder) || 0,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{addOn ? 'Edit Add-on' : 'New Add-on'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Price (₹) *</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Unit *</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. label, month" required />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Display Order</Label>
              <Input
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="recurring"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
              />
              <Label htmlFor="recurring">Recurring</Label>
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
