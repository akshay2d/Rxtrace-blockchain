'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';
import { User, Plus, Edit2, Trash2, Search, RefreshCw, X, Building2 } from 'lucide-react';

// User type based on auth.users and company linkage
interface UserRow {
  id: string;
  email: string;
  company_id?: string | null;
  company_name?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
}

interface CompanyRow {
  id: string;
  company_name: string;
}

export default function UsersManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    company_id: ''
  });

  useEffect(() => {
    fetchUsers();
    fetchCompanies();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch users');
      }
      
      if (data.success && data.users) {
        setUsers(data.users);
      }
    } catch (error: any) {
      alert('Failed to fetch users: ' + error.message);
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
        .order('company_name');
      if (error) throw error;
      if (data) setCompanies(data);
    } catch (error: any) {
      alert('Failed to fetch companies: ' + error.message);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const supabase = supabaseClient();
      if (editingUser) {
        // Update user
        const { error } = await supabase
          .from('users')
          .update({ email: formData.email, company_id: formData.company_id })
          .eq('id', editingUser.id);
        if (error) throw error;
        alert('User updated successfully!');
      } else {
        // Create user (invite flow or manual insert)
        alert('User creation should be done via signup/invite flow.');
      }
      setShowForm(false);
      setEditingUser(null);
      setFormData({ email: '', company_id: '' });
      fetchUsers();
    } catch (error: any) {
      alert('Failed to save user: ' + error.message);
    }
  }

  async function handleDelete(user: UserRow) {
    if (!confirm(`Are you sure you want to delete user ${user.email}? This will permanently delete the user account.`)) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }
      
      alert('User deleted successfully!');
      fetchUsers();
    } catch (error: any) {
      alert('Failed to delete user: ' + error.message);
    }
  }

  function openEditForm(user: UserRow) {
    setEditingUser(user);
    setFormData({
      email: user.email,
      company_id: user.company_id || ''
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingUser(null);
    setFormData({ email: '', company_id: '' });
  }

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#0052CC]">👤 Users Management</h1>
          <p className="text-gray-600 mt-1">View and manage user accounts</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchUsers} disabled={loading} variant="outline">
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
              placeholder="Search by email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Users Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUsers.map((user) => (
          <Card key={user.id} className="hover:shadow-lg transition">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg text-[#0052CC]">{user.email}</CardTitle>
                  <Badge className="mt-2 bg-blue-500 text-white">User</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm">
                <span className="text-gray-500">🏢 Company:</span>
                <div className="font-medium">
                  {user.company_name || companies.find(c => c.id === user.company_id)?.company_name || 'N/A'}
                </div>
              </div>
              <div className="text-xs text-gray-400 pt-2 border-t">
                Registered: {new Date(user.created_at).toLocaleDateString('en-IN')}
              </div>
              <div className="flex gap-2 pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEditForm(user)}
                  className="flex-1"
                >
                  <Edit2 className="w-3 h-3 mr-1" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(user)}
                  className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredUsers.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-500">
            <User className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p>{searchTerm ? 'No users found matching your search' : 'No users registered yet'}</p>
          </div>
        )}
      </div>

      {/* Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingUser ? 'Edit User' : 'Add New User'}</CardTitle>
              <Button variant="ghost" size="sm" onClick={closeForm}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="company_id">Company</Label>
                  <select
                    id="company_id"
                    value={formData.company_id}
                    onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                    className="w-full border rounded p-2"
                  >
                    <option value="">-- Select Company --</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button type="submit" className="flex-1 bg-[#0052CC] hover:bg-[#0052CC]/90">
                    {editingUser ? 'Update User' : 'Create User'}
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
