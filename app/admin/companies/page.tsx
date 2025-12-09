'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';
import { Building2, Plus, Edit2, Trash2, Search, RefreshCw, X } from 'lucide-react';

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

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setCompanies(data);
    } catch (error: any) {
      console.error('Error:', error);
      alert('Failed to fetch companies: ' + error.message);
    } finally {
      setLoading(false);
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
          <Card key={company.id} className="hover:shadow-lg transition">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg text-[#0052CC]">{company.company_name}</CardTitle>
                  <Badge className="mt-2 bg-green-500 text-white">Active</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {company.contact_email && (
                <div className="text-sm">
                  <span className="text-gray-500">📧 Email:</span>
                  <div className="font-medium">{company.contact_email}</div>
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
              {company.address && (
                <div className="text-sm">
                  <span className="text-gray-500">📍 Address:</span>
                  <div className="text-xs">{company.address}</div>
                </div>
              )}
              <div className="text-xs text-gray-400 pt-2 border-t">
                Registered: {new Date(company.created_at).toLocaleDateString('en-IN')}
              </div>

              <div className="flex gap-2 pt-3">
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
        ))}

        {filteredCompanies.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-500">
            <Building2 className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p>{searchTerm ? 'No companies found matching your search' : 'No companies registered yet'}</p>
          </div>
        )}
      </div>

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
