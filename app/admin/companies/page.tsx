'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { supabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Building2, Edit2, Trash2, Search, RefreshCw, X, Ban, CheckCircle, FileText } from 'lucide-react';
import { AdminConfirmDialog } from '@/components/admin/AdminConfirmDialog';
import { useDestructiveAction } from '@/lib/admin/useDestructiveAction';

type Company = {
  id: string;
  company_name: string;
  user_id: string;
  created_at: string;
  gst_number?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  trial_status?: 'Active' | 'Expired' | 'Not Used';
  trial_end?: string | null;
  trial_status_raw?: string | null;
  trial_end_date?: string | null;
  trial_ends_at?: string | null;
};

async function parseApiJson(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(
      `Expected JSON response but got ${contentType || 'unknown'} (${response.status}): ${text.slice(0, 140)}`
    );
  }
  return response.json();
}

function inferTrialStatus(company: Company): { trial_status: Company['trial_status']; trial_end: string | null } {
  const trialEnd = company.trial_ends_at || company.trial_end_date || null;
  if (trialEnd) {
    return {
      trial_status: new Date(trialEnd) > new Date() ? 'Active' : 'Expired',
      trial_end: trialEnd,
    };
  }

  const raw = String(company.trial_status_raw || '').trim().toLowerCase();
  if (['trial', 'trialing', 'active'].includes(raw)) {
    return { trial_status: 'Active', trial_end: null };
  }
  if (['expired', 'cancelled', 'ended'].includes(raw)) {
    return { trial_status: 'Expired', trial_end: null };
  }
  return { trial_status: 'Not Used', trial_end: null };
}

export default function CompaniesManagement() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({
    company_name: '',
    gst_number: '',
    contact_email: '',
    contact_phone: '',
    address: ''
  });
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetReason, setResetReason] = useState('');
  const [resetTarget, setResetTarget] = useState<Company | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  // PHASE-2: Two-step confirmation for freeze/unfreeze
  const [freezeConfirming, setFreezeConfirming] = useState(false);
  const destructive = useDestructiveAction<{ company: Company; newStatus: string }>();

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      let trialMap = new Map<string, { trial_status: Company['trial_status']; trial_end: string | null }>();
      try {
        const res = await fetch('/api/admin/companies', { credentials: 'include' });
        if (res.ok) {
          const payload = await res.json();
          (payload.companies || []).forEach((row: any) => {
            trialMap.set(row.id, {
              trial_status: row.trial_status as Company['trial_status'],
              trial_end: row.trial_end ?? null
            });
          });
        } else {
          console.warn('Failed to load /api/admin/companies for trial status:', res.status);
        }
      } catch (_) {
        // If trial status fetch fails, keep company list without trial data.
      }

      if (data) {
        const merged = data.map((company: Company) => {
          const trialInfo = trialMap.get(company.id);
          if (trialInfo) return { ...company, ...trialInfo };
          return { ...company, ...inferTrialStatus(company) };
        });
        setCompanies(merged);
      }
    } catch (error: any) {
      console.error('Error:', error);
      alert('Failed to fetch companies: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      const supabase = supabaseClient();
      
      if (editingCompany) {
        // Update existing company
        const { error } = await supabase
          .from('companies')
          .update(formData)
          .eq('id', editingCompany.id);

        if (error) throw error;
        alert('Company updated successfully!');
      } else {
        // Create new company would need user_id - show message
        alert('New company creation requires user signup. Use the signup page to create new companies with users.');
      }

      setShowForm(false);
      setEditingCompany(null);
      setFormData({ company_name: '', gst_number: '', contact_email: '', contact_phone: '', address: '' });
      fetchCompanies();
    } catch (error: any) {
      console.error('Error:', error);
      alert('Failed to save company: ' + error.message);
    }
  }

  async function handleDelete(company: Company) {
    if (!confirm(`Are you sure you want to delete "${company.company_name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/companies/${company.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const result = await parseApiJson(response);
      if (!response.ok) {
        throw new Error(result.error || result.message || `Failed (${response.status})`);
      }
      alert('Company deleted successfully!');
      fetchCompanies();
    } catch (error: any) {
      console.error('Error:', error);
      alert('Failed to delete company: ' + error.message);
    }
  }

  function openEditForm(company: Company) {
    setEditingCompany(company);
    setFormData({
      company_name: company.company_name,
      gst_number: company.gst_number || '',
      contact_email: company.contact_email || '',
      contact_phone: company.contact_phone || '',
      address: company.address || ''
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCompany(null);
    setFormData({ company_name: '', gst_number: '', contact_email: '', contact_phone: '', address: '' });
  }

  async function handleResetTrial() {
    if (!resetTarget) return;
    setResetLoading(true);
    try {
      const response = await fetch('/api/admin/trial/reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: resetTarget.id,
          reason: resetReason.trim() || undefined
        })
      });
      const result = await parseApiJson(response);
      if (!response.ok) throw new Error(result.error || 'Failed to reset trial');
      alert('Trial reset successfully');
      setResetModalOpen(false);
      setResetReason('');
      setResetTarget(null);
      fetchCompanies();
    } catch (error: any) {
      console.error('Error resetting trial:', error);
      alert('Failed to reset trial: ' + error.message);
    } finally {
      setResetLoading(false);
    }
  }

  async function handleToggleFreeze(company: Company) {
    const supabase = supabaseClient();
    const { data: wallet } = await supabase
      .from('company_wallets')
      .select('status')
      .eq('company_id', company.id)
      .maybeSingle();
    
    const currentStatus = wallet?.status || 'ACTIVE';
    const newStatus = currentStatus === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';

    try {
      const response = await fetch('/api/admin/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: company.id,
          status: newStatus
        })
      });

      const result = await response.json();

      if (result.requires_confirmation && result.confirmation_token) {
        destructive.requestConfirmation({
          title: newStatus === 'FROZEN' ? 'Freeze company account' : 'Unfreeze company account',
          description: `Are you sure you want to ${newStatus === 'FROZEN' ? 'FREEZE' : 'UNFREEZE'} "${company.company_name}"? This affects the company's ability to use the platform.`,
          confirmationToken: result.confirmation_token,
          context: { company, newStatus }
        });
        return;
      }

      if (!response.ok) throw new Error(result.error || result.message);

      alert(`Account ${newStatus === 'FROZEN' ? 'frozen' : 'unfrozen'} successfully!`);
      fetchCompanies();
    } catch (error: any) {
      console.error('Error toggling freeze:', error);
      alert('Failed to update account status: ' + error.message);
    }
  }

  async function handleConfirmFreeze() {
    const { token, context: ctx } = destructive.consumeToken();
    if (!token || !ctx) return;

    setFreezeConfirming(true);
    try {
      const response = await fetch('/api/admin/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: ctx.company.id,
          status: ctx.newStatus,
          confirmation_token: token
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message);

      alert(`Account ${ctx.newStatus === 'FROZEN' ? 'frozen' : 'unfrozen'} successfully!`);
      fetchCompanies();
    } catch (error: any) {
      console.error('Error confirming freeze:', error);
      alert('Failed to update account status: ' + error.message);
    } finally {
      setFreezeConfirming(false);
    }
  }

  const filteredCompanies = companies.filter(company =>
    company.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.contact_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.gst_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#0052CC]">🏢 Companies Management</h1>
          <p className="text-gray-600 mt-1">View and manage registered companies</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchCompanies} disabled={loading} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by company name, email, or GST number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Companies Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCompanies.map((company) => (
          <CompanyCard 
            key={company.id} 
            company={company} 
            onToggleFreeze={handleToggleFreeze}
            onEdit={openEditForm}
            onDelete={handleDelete}
            onResetTrial={(c) => {
              setResetTarget(c);
              setResetReason('');
              setResetModalOpen(true);
            }}
          />
        ))}

        {filteredCompanies.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-500">
            <Building2 className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p>{searchTerm ? 'No companies found matching your search' : 'No companies registered yet'}</p>
          </div>
        )}
      </div>

      {/* PHASE-2: Confirmation dialog for freeze/unfreeze */}
      <AdminConfirmDialog
        open={destructive.dialogOpen}
        onOpenChange={destructive.closeDialog}
        title={destructive.dialogTitle}
        description={destructive.dialogDescription}
        confirmLabel={destructive.pendingContext?.newStatus === 'FROZEN' ? 'Freeze account' : 'Unfreeze account'}
        cancelLabel="Cancel"
        variant="danger"
        loading={freezeConfirming}
        onConfirm={handleConfirmFreeze}
      />

      {/* Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingCompany ? 'Edit Company' : 'Add New Company'}</CardTitle>
              <Button variant="ghost" size="sm" onClick={closeForm}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="contact_email">Contact Email</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="contact_phone">Contact Phone</Label>
                  <Input
                    id="contact_phone"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="gst_number">GST Number</Label>
                  <Input
                    id="gst_number"
                    value={formData.gst_number}
                    onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="submit" className="flex-1 bg-[#0052CC] hover:bg-[#0052CC]/90">
                    {editingCompany ? 'Update Company' : 'Create Company'}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeForm} className="flex-1">
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reset Trial Modal */}
      {resetModalOpen && resetTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Reset Trial</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setResetModalOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Reset trial for <strong>{resetTarget.company_name}</strong>. This will remove the current
                trial row so the company can start a new trial.
              </p>
              <div>
                <Label htmlFor="reset_reason">Reason (optional)</Label>
                <Input
                  id="reset_reason"
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  placeholder="Support case or justification"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setResetModalOpen(false)}
                  disabled={resetLoading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleResetTrial}
                  disabled={resetLoading}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  {resetLoading ? 'Resetting...' : 'Reset Trial'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Company Card Component (separated to use hooks properly)
function CompanyCard({ 
  company, 
  onToggleFreeze, 
  onEdit, 
  onDelete,
  onResetTrial
}: { 
  company: Company; 
  onToggleFreeze: (c: Company) => void;
  onEdit: (c: Company) => void;
  onDelete: (c: Company) => void;
  onResetTrial: (c: Company) => void;
}) {
  const [status, setStatus] = useState<'ACTIVE' | 'FROZEN'>('ACTIVE');

  useEffect(() => {
    const fetchStatus = async () => {
      const supabase = supabaseClient();
      const { data } = await supabase
        .from('company_wallets')
        .select('status')
        .eq('company_id', company.id)
        .maybeSingle();
      if (data?.status) setStatus(data.status as 'ACTIVE' | 'FROZEN');
    };
    fetchStatus();
  }, [company.id]);

  return (
    <Card className="hover:shadow-lg transition">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg text-[#0052CC]">{company.company_name}</CardTitle>
            <div className="flex gap-2 mt-2">
              <Badge className={status === 'ACTIVE' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}>
                {status === 'ACTIVE' ? <CheckCircle className="w-3 h-3 mr-1" /> : <Ban className="w-3 h-3 mr-1" />}
                {status}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {company.contact_email && (
          <div className="text-sm">
            <span className="text-gray-500">📧 Email:</span>
            <div className="font-medium text-xs">{company.contact_email}</div>
          </div>
        )}
        {company.contact_phone && (
          <div className="text-sm">
            <span className="text-gray-500">📱 Phone:</span>
            <div className="font-medium">{company.contact_phone}</div>
          </div>
        )}
        {company.gst_number && (
          <div className="text-sm">
            <span className="text-gray-500">🏛 GST:</span>
            <div className="font-mono text-xs">{company.gst_number}</div>
          </div>
        )}
        <div className="text-xs text-gray-400 pt-2 border-t">
          Registered: {new Date(company.created_at).toLocaleDateString('en-IN')}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onToggleFreeze(company)}
            className={`flex-1 ${status === 'FROZEN' ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300' : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-300'}`}
          >
            {status === 'FROZEN' ? <CheckCircle className="w-3 h-3 mr-1" /> : <Ban className="w-3 h-3 mr-1" />}
            {status === 'FROZEN' ? 'Unfreeze' : 'Freeze'}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.href = `/admin/companies/${company.id}`}
            className="flex-1"
          >
            <FileText className="w-3 h-3 mr-1" /> Audit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(company)}
            className="flex-1"
          >
            <Edit2 className="w-3 h-3 mr-1" /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onResetTrial(company)}
            className="flex-1"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Reset Trial
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(company)}
            className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-3 h-3 mr-1" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
