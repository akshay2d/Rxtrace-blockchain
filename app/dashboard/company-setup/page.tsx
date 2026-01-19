'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function CompanySetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [company, setCompany] = useState<any>(null);

  // Form fields - simplified for edit mode
  const [companyName, setCompanyName] = useState('');
  const [pan, setPan] = useState('');
  const [gst, setGst] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = supabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/auth/signin');
        return;
      }

      // Check if company exists
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id, company_name, pan, gst, address, email, user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingCompany?.id) {
        // Edit mode - load existing data
        setMode('edit');
        setCompany(existingCompany);
        setCompanyName(existingCompany.company_name || '');
        setPan(existingCompany.pan || '');
        setGst(existingCompany.gst || '');
        setAddress(existingCompany.address || '');
      } else {
        // Create mode
        setMode('create');
      }

      setLoading(false);
    })();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      if (mode === 'create') {
        // Create mode - redirect to onboarding for full setup
        router.push('/onboarding/setup');
        return;
      }

      // Edit mode - update existing company
      const res = await fetch('/api/company/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName.trim(),
          pan: pan.trim() || null,
          gst: gst.trim() || null,
          address: address.trim() || null,
        }),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(result.error || 'Failed to update company profile');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard/billing');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to save company profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-sm text-gray-500">Loading company information...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-gray-900 mb-1.5">
          {mode === 'create' ? 'Set Up Company Profile' : 'Edit Company Profile'}
        </h1>
        <p className="text-sm text-gray-600">
          {mode === 'create' 
            ? 'Complete your company profile to continue' 
            : 'Update your company information'}
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          Company profile updated successfully. Redirecting...
        </div>
      )}

      {/* Form */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? 'Company Information' : 'Company Details'}
          </CardTitle>
          <CardDescription>
            {mode === 'create' 
              ? 'Complete your company profile to start using RxTrace' 
              : 'Update your company profile information'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === 'create' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                Company profile setup is required to use RxTrace. This will guide you through the complete company setup process.
              </p>
              <Button 
                onClick={() => router.push('/onboarding/setup')}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Go to Company Setup →
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Read-only Company ID */}
              {company?.id && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <Label className="text-xs text-gray-500">Company ID (Read-only)</Label>
                  <p className="text-sm font-mono text-gray-700 mt-1">{company.id}</p>
                </div>
              )}

              {/* Read-only Owner Email */}
              {company?.email && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <Label className="text-xs text-gray-500">Owner Email (Read-only)</Label>
                  <p className="text-sm text-gray-700 mt-1">{company.email}</p>
                </div>
              )}

              {/* Company Name */}
              <div>
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Enter company name"
                  required
                  disabled={submitting}
                  className="mt-1.5"
                />
              </div>

              {/* PAN */}
              <div>
                <Label htmlFor="pan">PAN Number</Label>
                <Input
                  id="pan"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  disabled={submitting}
                  className="mt-1.5"
                />
              </div>

              {/* GST */}
              <div>
                <Label htmlFor="gst">GST Number</Label>
                <Input
                  id="gst"
                  value={gst}
                  onChange={(e) => setGst(e.target.value.toUpperCase())}
                  placeholder="29ABCDE1234F1Z5"
                  maxLength={15}
                  disabled={submitting}
                  className="mt-1.5"
                />
              </div>

              {/* Address */}
              <div>
                <Label htmlFor="address">Address</Label>
                <textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter company address"
                  rows={3}
                  disabled={submitting}
                  className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/dashboard/billing')}
                  disabled={submitting}
                  className="border-gray-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || !companyName.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
