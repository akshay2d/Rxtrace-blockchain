'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, Edit2, X, Save, Trash2, Ban, CheckCircle, Building2, Tag, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabaseClient } from '@/lib/supabase/client';

type Discount = {
  id: string;
  code: string;
  type: 'percentage' | 'flat';
  value: number;
  valid_from: string;
  valid_to: string | null;
  usage_limit: number | null;
  usage_count: number;
  is_active: boolean;
  razorpay_offer_id?: string | null;
  created_at: string;
  updated_at: string;
};

type Company = {
  id: string;
  company_name: string;
};

type CompanyAssignment = {
  id: string;
  company_id: string;
  discount_id: string;
  applied_at: string;
  companies?: Company;
};

export default function AdminDiscountsPage() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(null);
  const [assignments, setAssignments] = useState<CompanyAssignment[]>([]);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignCompanyId, setAssignCompanyId] = useState('');

  useEffect(() => {
    fetchDiscounts();
    fetchCompanies();
  }, []);

  async function fetchDiscounts() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/discounts');
      const data = await res.json();
      if (data.success) {
        setDiscounts(data.discounts || []);
      }
    } catch (err) {
      console.error('Failed to fetch discounts:', err);
      alert('Failed to fetch discounts');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCompanies() {
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name')
        .order('company_name', { ascending: true });
      
      if (error) throw error;
      if (data) {
        setCompanies(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch companies:', err);
    }
  }

  async function fetchAssignments(discountId: string) {
    try {
      const res = await fetch(`/api/admin/discounts/assign?discount_id=${discountId}`);
      const data = await res.json();
      if (data.success) {
        setAssignments(data.assignments || []);
      }
    } catch (err) {
      console.error('Failed to fetch assignments:', err);
    }
  }

  async function handleSave(discount: Partial<Discount>) {
    try {
      const url = '/api/admin/discounts';
      const method = editingDiscount ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingDiscount ? { ...discount, id: editingDiscount.id } : discount),
      });

      const data = await res.json();
      if (data.success) {
        await fetchDiscounts();
        setShowForm(false);
        setEditingDiscount(null);
      } else {
        alert('Failed to save: ' + data.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  }

  async function handleToggleActive(discount: Discount) {
    if (!confirm(`Are you sure you want to ${discount.is_active ? 'deactivate' : 'activate'} this discount?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/discounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: discount.id, is_active: !discount.is_active }),
      });

      const data = await res.json();
      if (data.success) {
        await fetchDiscounts();
      } else {
        alert('Failed to update: ' + data.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  }

  async function handleDelete(discount: Discount) {
    if (!confirm(`Are you sure you want to DELETE this discount permanently? This will also remove all company assignments. This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/discounts?id=${discount.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        await fetchDiscounts();
        alert('Discount deleted successfully');
      } else {
        alert('Failed to delete: ' + data.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  }

  async function handleAssign() {
    if (!selectedDiscount || !assignCompanyId) {
      alert('Please select a company');
      return;
    }

    try {
      const res = await fetch('/api/admin/discounts/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: assignCompanyId,
          discount_id: selectedDiscount.id,
        }),
      });

      const data = await res.json();
      if (data.success) {
        await fetchAssignments(selectedDiscount.id);
        setAssignCompanyId('');
        alert('Discount assigned successfully');
      } else {
        alert('Failed to assign: ' + data.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  }

  async function handleUnassign(companyId: string, discountId: string) {
    if (!confirm('Are you sure you want to remove this discount assignment?')) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/discounts/assign?company_id=${companyId}&discount_id=${discountId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        await fetchAssignments(discountId);
        alert('Discount assignment removed successfully');
      } else {
        alert('Failed to remove assignment: ' + data.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  }

  function openAssignDialog(discount: Discount) {
    setSelectedDiscount(discount);
    setShowAssignDialog(true);
    fetchAssignments(discount.id);
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return 'No expiry';
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function isExpired(discount: Discount) {
    if (!discount.valid_to) return false;
    return new Date(discount.valid_to) < new Date();
  }

  function isUsageLimitReached(discount: Discount) {
    if (!discount.usage_limit) return false;
    return discount.usage_count >= discount.usage_limit;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#0052CC]">🎫 Discounts & Coupons</h1>
          <p className="text-gray-600 mt-1">Manage discount codes and company assignments</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchDiscounts} disabled={loading} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => { setEditingDiscount(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            New Discount
          </Button>
        </div>
      </div>

      {showForm && (
        <DiscountForm
          discount={editingDiscount}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingDiscount(null); }}
        />
      )}

      <div className="grid gap-4">
        {discounts.map((discount) => (
          <Card key={discount.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="w-5 h-5" />
                    {discount.code}
                    <Badge variant={discount.is_active ? 'default' : 'secondary'}>
                      {discount.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    {isExpired(discount) && <Badge variant="destructive">Expired</Badge>}
                    {isUsageLimitReached(discount) && <Badge variant="outline">Limit Reached</Badge>}
                  </CardTitle>
                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                    <p>
                      <strong>Type:</strong> {discount.type === 'percentage' ? `${discount.value}%` : `₹${discount.value}`}
                    </p>
                    <p>
                      <strong>Valid:</strong> {formatDate(discount.valid_from)} - {formatDate(discount.valid_to)}
                    </p>
                    <p>
                      <strong>Usage:</strong> {discount.usage_count}
                      {discount.usage_limit ? ` / ${discount.usage_limit}` : ' / Unlimited'}
                    </p>
                    {discount.razorpay_offer_id && (
                      <p>
                        <strong>Razorpay Offer ID:</strong> <code className="text-xs bg-gray-100 px-1 rounded">{discount.razorpay_offer_id}</code>
                      </p>
                    )}
                    <p>
                      <strong>Created:</strong> {formatDate(discount.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAssignDialog(discount)}
                  >
                    <Users className="w-4 h-4 mr-1" />
                    Assign
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditingDiscount(discount); setShowForm(true); }}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleActive(discount)}
                  >
                    {discount.is_active ? (
                      <>
                        <Ban className="w-4 h-4 mr-1" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Activate
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(discount)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {discounts.length === 0 && !loading && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-500">No discounts found. Create your first discount code.</p>
          </CardContent>
        </Card>
      )}

      {/* Assign Dialog */}
      {showAssignDialog && selectedDiscount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Assign Discount: {selectedDiscount.code}</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Assign this discount code to companies. Companies can use this code at checkout.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowAssignDialog(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Select value={assignCompanyId} onValueChange={setAssignCompanyId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAssign} disabled={!assignCompanyId}>
                  <Plus className="w-4 h-4 mr-2" />
                  Assign
                </Button>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Assigned Companies ({assignments.length})</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {assignments.map((assignment) => {
                    // Fetch company name if not in assignment
                    const companyName = assignment.companies?.company_name || 
                      companies.find(c => c.id === assignment.company_id)?.company_name || 
                      'Unknown';
                    return (
                      <div key={assignment.id} className="flex justify-between items-center p-2 border rounded">
                        <div>
                          <p className="font-medium">{companyName}</p>
                          <p className="text-xs text-gray-500">
                            Assigned: {formatDate(assignment.applied_at)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleUnassign(assignment.company_id, assignment.discount_id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                  {assignments.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No companies assigned</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function DiscountForm({ discount, onSave, onCancel }: { discount: Discount | null; onSave: (d: Partial<Discount>) => void; onCancel: () => void }) {
  const [code, setCode] = useState(discount?.code || '');
  const [type, setType] = useState<'percentage' | 'flat'>(discount?.type || 'percentage');
  const [value, setValue] = useState(discount?.value?.toString() || '');
  const [validFrom, setValidFrom] = useState(discount?.valid_from ? new Date(discount.valid_from).toISOString().split('T')[0] : '');
  const [validTo, setValidTo] = useState(discount?.valid_to ? new Date(discount.valid_to).toISOString().split('T')[0] : '');
  const [usageLimit, setUsageLimit] = useState(discount?.usage_limit?.toString() || '');
  const [isActive, setIsActive] = useState(discount?.is_active ?? true);
  const [razorpayOfferId, setRazorpayOfferId] = useState(discount?.razorpay_offer_id ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      code,
      type,
      value: parseFloat(value),
      valid_from: validFrom ? new Date(validFrom).toISOString() : new Date().toISOString(),
      valid_to: validTo ? new Date(validTo).toISOString() : null,
      usage_limit: usageLimit ? parseInt(usageLimit) : null,
      is_active: isActive,
      razorpay_offer_id: razorpayOfferId.trim() || null,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{discount ? 'Edit Discount' : 'New Discount'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Discount Code *</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. SUMMER20"
              required
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Type *</Label>
              <Select value={type} onValueChange={(v: 'percentage' | 'flat') => setType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="flat">Flat Amount (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Value *</Label>
              <Input
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={type === 'percentage' ? 'e.g. 20' : 'e.g. 500'}
                required
              />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Valid From *</Label>
              <Input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Valid To (Optional)</Label>
              <Input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Usage Limit (Optional)</Label>
            <Input
              type="number"
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
              placeholder="Leave empty for unlimited"
            />
          </div>
          <div>
            <Label>Razorpay Offer ID (Optional)</Label>
            <Input
              value={razorpayOfferId}
              onChange={(e) => setRazorpayOfferId(e.target.value)}
              placeholder="e.g. offer_xxxx from Razorpay Dashboard"
              className="font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Required for this coupon to apply discount at checkout. Create matching offer in Razorpay Dashboard and paste ID here.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <Label htmlFor="isActive">Active</Label>
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
