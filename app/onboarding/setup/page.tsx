'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FirmType = 'proprietorship' | 'partnership' | 'llp' | 'pvt_ltd' | 'ltd';

export default function OnboardingSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [contactPersonName, setContactPersonName] = useState('');
  const [firmType, setFirmType] = useState<FirmType>('proprietorship');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pan, setPan] = useState('');
  const [gst, setGst] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [businessType, setBusinessType] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = supabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/auth/signin');
        return;
      }

      // Check if company profile already exists with active subscription or trial
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id, company_name, subscription_status, trial_end_date')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingCompany?.id) {
        // Check if subscription is active or trial is still valid
        if (existingCompany.subscription_status === 'trial' || existingCompany.subscription_status === 'active') {
          // Already has active trial or subscription - redirect to dashboard
          router.replace('/dashboard');
          return;
        }
        // If company exists but no active subscription/trial, redirect to pricing
        if (!existingCompany.subscription_status) {
          router.replace('/pricing');
          return;
        }
      }

      // Pre-fill email from auth user
      setEmail(user.email || '');
      setLoading(false);
    })();
  }, [router]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    // Validation
    if (!pan.trim()) {
      setError('PAN card number is required');
      setSubmitting(false);
      return;
    }

    try {
      const supabase = supabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/auth/signin');
        return;
      }

      // Save company profile
      const res = await fetch('/api/setup/create-company-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          company_name: companyName.trim(),
          contact_person_name: contactPersonName.trim(),
          firm_type: firmType,
          address: address.trim(),
          email: email.trim(),
          phone: phone.trim(),
          pan: pan.trim(),
          gst: gst.trim() || null,
          business_category: businessCategory,
          business_type: businessType,
        }),
      });

      const out = await res.json();

      if (!res.ok) {
        setError(out?.error || 'Failed to save company profile');
        setSubmitting(false);
        return;
      }

      // Profile saved successfully - redirect to pricing page
      router.push('/pricing?onboarding=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-orange-50">
        <div className="text-sm text-gray-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="text-2xl text-[#0052CC]">
            Company Profile Setup
          </CardTitle>
          <p className="text-sm text-gray-600 mt-2">
            Complete your company profile to proceed to pricing and trial activation
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
              {/* Company Name */}
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company Name *"
                required
                disabled={submitting}
              />

              {/* Contact Person Name */}
              <Input
                value={contactPersonName}
                onChange={(e) => setContactPersonName(e.target.value)}
                placeholder="Contact Person Name *"
                required
                disabled={submitting}
              />

              {/* Type of Firm */}
              <Select value={firmType} onValueChange={(v) => setFirmType(v as FirmType)} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Type of Firm *" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proprietorship">Proprietorship</SelectItem>
                  <SelectItem value="partnership">Partnership</SelectItem>
                  <SelectItem value="llp">LLP</SelectItem>
                  <SelectItem value="pvt_ltd">Private Limited (Pvt Ltd)</SelectItem>
                  <SelectItem value="ltd">Limited (Ltd)</SelectItem>
                </SelectContent>
              </Select>

              {/* Address */}
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Complete Address *"
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500"
                rows={3}
                required
                disabled={submitting}
              />

              {/* Company Email */}
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Company Email *"
                required
                disabled={submitting}
              />

              {/* Phone */}
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone Number *"
                required
                disabled={submitting}
              />

              {/* PAN Card - Required */}
              <Input
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                placeholder="PAN Card Number *"
                required
                maxLength={10}
                disabled={submitting}
              />

              {/* GST - Optional */}
              <Input
                value={gst}
                onChange={(e) => setGst(e.target.value.toUpperCase())}
                placeholder="GST Number (Optional)"
                maxLength={15}
                disabled={submitting}
              />

              {/* Business Category */}
              <Select value={businessCategory} onValueChange={setBusinessCategory} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Category of Business *" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pharma">Pharmaceuticals</SelectItem>
                  <SelectItem value="food">Food & Beverages</SelectItem>
                  <SelectItem value="dairy">Dairy Products</SelectItem>
                  <SelectItem value="logistics">Logistics & Supply Chain</SelectItem>
                </SelectContent>
              </Select>

              {/* Business Type */}
              <Select value={businessType} onValueChange={setBusinessType} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Type of Business *" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manufacturer">Manufacturer</SelectItem>
                  <SelectItem value="exporter">Exporter</SelectItem>
                  <SelectItem value="distributor">Distributor</SelectItem>
                  <SelectItem value="wholesaler">Wholesaler</SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600"
                disabled={submitting || !companyName.trim() || !contactPersonName.trim() || !businessCategory || !businessType}
              >
                {submitting ? 'Saving…' : 'Save Profile & Continue to Pricing →'}
              </Button>
            </form>
        </CardContent>
      </Card>
    </div>
  );
}
