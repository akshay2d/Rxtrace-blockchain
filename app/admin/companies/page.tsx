'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';
import { Building2, Plus, Edit2, Trash2, Search, RefreshCw, X, Wallet, Ban, CheckCircle, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/billingConfig';

type Company = {
  id: string;
  company_name: string;
  user_id: string;
  created_at: string;
  gst_number?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
};

type CompanyWallet = {
  company_id: string;
  balance: number;
  status: 'ACTIVE' | 'FROZEN';
  updated_at: string;
};

type BillingTransaction = {
  id: string;
  company_id: string;
  type: string;
  amount: number;
  notes: string;
  created_at: string;
};

export default function CompaniesManagement() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [wallets, setWallets] = useState<Record<string, CompanyWallet>>({});
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
  
  // Billing management state
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditType, setCreditType] = useState<'credit' | 'debit'>('credit');
  const [creditNotes, setCreditNotes] = useState('');
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [processingCredit, setProcessingCredit] = useState(false);

  const fetchWallets = useCallback(async (companyIds: string[]) => {
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('company_wallets')
        .select('*')
        .in('company_id', companyIds);

      if (error) throw error;

      const walletsMap: Record<string, CompanyWallet> = {};
      data?.forEach((wallet) => {
        walletsMap[wallet.company_id] = wallet;
      });
      setWallets(walletsMap);
    } catch (error: any) {
      console.error('Error fetching wallets:', error);
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        setCompanies(data);
        // Fetch wallets for all companies
        fetchWallets(data.map((c) => c.id));
      }
    } catch (error: any) {
      console.error('Error:', error);
      alert('Failed to fetch companies: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [fetchWallets]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    if (selectedCompany) {
      fetchTransactions(selectedCompany.id);
    }
  }, [selectedCompany]);

  async function fetchTransactions(companyId: string) {
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('billing_transactions')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
    }
  }

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
      const supabase = supabaseClient();
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', company.id);

      if (error) throw error;
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

  function openCreditModal(company: Company) {
    setSelectedCompany(company);
    setShowCreditModal(true);
    setCreditAmount('');
    setCreditType('credit');
    setCreditNotes('');
  }

  function closeCreditModal() {
    setShowCreditModal(false);
    setSelectedCompany(null);
    setCreditAmount('');
    setCreditNotes('');
  }

  async function handleCreditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompany) return;

    setProcessingCredit(true);
    try {
      const amount = parseFloat(creditAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Invalid amount');
      }

      const finalAmount = creditType === 'debit' ? -amount : amount;

      const response = await fetch('/api/admin/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: selectedCompany.id,
          amount: finalAmount,
          type: 'admin_adjustment',
          notes: creditNotes || `Admin ${creditType}: ${formatCurrency(Math.abs(finalAmount))}`
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      alert(`Successfully ${creditType === 'credit' ? 'credited' : 'debited'} ${formatCurrency(Math.abs(finalAmount))}!`);
      
      // Refresh data
      fetchWallets(companies.map(c => c.id));
      fetchTransactions(selectedCompany.id);
      closeCreditModal();
    } catch (error: any) {
      console.error('Error processing credit:', error);
      alert('Failed to process credit: ' + error.message);
    } finally {
      setProcessingCredit(false);
    }
  }

  async function handleToggleFreeze(company: Company) {
    const wallet = wallets[company.id];
    const currentStatus = wallet?.status || 'ACTIVE';
    const newStatus = currentStatus === 'ACTIVE' ? 'FROZEN' : 'ACTIVE';

    if (!confirm(`Are you sure you want to ${newStatus === 'FROZEN' ? 'FREEZE' : 'UNFREEZE'} ${company.company_name}'s account?`)) {
      return;
    }

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
      if (!response.ok) throw new Error(result.error);

      alert(`Account ${newStatus === 'FROZEN' ? 'frozen' : 'unfrozen'} successfully!`);
      fetchWallets(companies.map(c => c.id));
    } catch (error: any) {
      console.error('Error toggling freeze:', error);
      alert('Failed to update account status: ' + error.message);
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
        {filteredCompanies.map((company) => {
          const wallet = wallets[company.id];
          const balance = wallet?.balance || 0;
          const status = wallet?.status || 'ACTIVE';
          
          return (
            <Card key={company.id} className="hover:shadow-lg transition">
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
                {/* Wallet Balance */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-[#0052CC]" />
                      <span className="text-sm font-medium text-gray-700">Balance:</span>
                    </div>
                    <span className={`text-lg font-bold ${balance < 0 ? 'text-red-600' : balance < 100 ? 'text-orange-600' : 'text-green-600'}`}>
                      {formatCurrency(balance)}
                    </span>
                  </div>
                </div>

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
                    onClick={() => openCreditModal(company)}
                    className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
                  >
                    <Wallet className="w-3 h-3 mr-1" /> Credit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleFreeze(company)}
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
                    onClick={() => openEditForm(company)}
                    className="flex-1"
                  >
                    <Edit2 className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(company)}
                    className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredCompanies.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-500">
            <Building2 className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p>{searchTerm ? 'No companies found matching your search' : 'No companies registered yet'}</p>
          </div>
        )}
      </div>

      {/* Credit Management Modal */}
      {showCreditModal && selectedCompany && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <div>
                <CardTitle>💳 Manage Credits - {selectedCompany.company_name}</CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  Current Balance: <span className="font-bold text-[#0052CC]">{formatCurrency(wallets[selectedCompany.id]?.balance || 0)}</span>
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={closeCreditModal}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* Credit Form */}
              <form onSubmit={handleCreditSubmit} className="space-y-4 border-b pb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="creditType">Transaction Type</Label>
                    <select
                      id="creditType"
                      value={creditType}
                      onChange={(e) => setCreditType(e.target.value as 'credit' | 'debit')}
                      className="w-full border rounded-md p-2"
                    >
                      <option value="credit">Credit (Add Balance)</option>
                      <option value="debit">Debit (Deduct Balance)</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="creditAmount">Amount (₹)</Label>
                    <div className="relative">
                      {creditType === 'credit' ? (
                        <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600 w-4 h-4" />
                      ) : (
                        <TrendingDown className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600 w-4 h-4" />
                      )}
                      <Input
                        id="creditAmount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(e.target.value)}
                        placeholder="Enter amount"
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="creditNotes">Notes (Optional)</Label>
                  <Input
                    id="creditNotes"
                    value={creditNotes}
                    onChange={(e) => setCreditNotes(e.target.value)}
                    placeholder="Reason for adjustment..."
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={processingCredit}
                  className={`w-full ${creditType === 'credit' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                >
                  {processingCredit ? 'Processing...' : `${creditType === 'credit' ? 'Add' : 'Deduct'} ${creditAmount ? formatCurrency(parseFloat(creditAmount)) : '₹0.00'}`}
                </Button>
              </form>

              {/* Transaction History */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  📊 Recent Transactions
                  <Badge variant="outline">{transactions.length}</Badge>
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {transactions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>No transactions yet</p>
                    </div>
                  ) : (
                    transactions.map((txn) => (
                      <div key={txn.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {txn.amount >= 0 ? (
                              <TrendingUp className="w-4 h-4 text-green-600" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-red-600" />
                            )}
                            <span className="font-mono text-sm font-medium">
                              {txn.amount >= 0 ? '+' : ''}{formatCurrency(txn.amount)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {txn.type.replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                          </div>
                          {txn.notes && (
                            <p className="text-xs text-gray-600 mt-1 ml-6">{txn.notes}</p>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(txn.created_at).toLocaleString('en-IN')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
    </div>
  );
}
