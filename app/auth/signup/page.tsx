// app/auth/signup/page.tsx
'use client';

import { useState } from 'react';
import { supabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

export default function SignUp() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const data = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      company_name: formData.get('company_name') as string,
      contact_person: formData.get('contact_person') as string,
      phone: formData.get('phone') as string,
      address: formData.get('address') as string,
      gst_number: formData.get('gst_number') as string,
      gtin_prefix: (formData.get('gtin_prefix') as string) || null,
      total_skus: formData.get('total_skus') ? Number(formData.get('total_skus')) : null,
      industry: formData.get('industry') as string,
      business_type: formData.get('business_type') as string,
      labels_per_month: (formData.get('labels_per_month') as string) || null,
    };

    // Check if user already exists
    const { data: existingUser } = await supabaseClient().auth.signInWithPassword({
      email: data.email,
      password: 'dummy-check-password'
    });

    // If sign in didn't fail with "Invalid login credentials", user might exist
    const { data: checkUser } = await supabaseClient()
      .from('companies')
      .select('email')
      .eq('email', data.email)
      .single();

    if (checkUser) {
      alert('⚠️ Account Already Exists!\n\nAn account with this email is already registered. Please sign in instead.');
      setLoading(false);
      router.push('/auth/signin');
      return;
    }

    // 1. Sign up the user
    const { data: authResponse, error: signUpError } = await supabaseClient().auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.contact_person },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (signUpError) {
      // Check if error is due to user already existing
      if (signUpError.message.includes('already registered') || 
          signUpError.message.includes('User already registered')) {
        alert('⚠️ Account Already Exists!\n\nThis email is already registered. Please sign in instead.');
        setLoading(false);
        router.push('/auth/signin');
        return;
      }
      alert('Signup failed: ' + signUpError.message);
      setLoading(false);
      return;
    }

    if (!authResponse.user) {
      alert('Signup failed — no user returned');
      setLoading(false);
      return;
    }

    // 2. Save company details (store in localStorage temporarily if email not confirmed)
    const companyData = {
      company_name: data.company_name,
      contact_person: data.contact_person,
      email: data.email,
      phone: data.phone,
      address: data.address,
      gst_number: data.gst_number,
      gtin_prefix: data.gtin_prefix,
      total_skus: data.total_skus,
      industry: data.industry,
      business_type: data.business_type,
      labels_per_month: data.labels_per_month,
      user_id: authResponse.user.id,
    };

    // Try to save company details
    const { error: companyError } = await supabaseClient()
      .from('companies')
      .insert(companyData);

    if (companyError) {
      // Store company data in localStorage to save after email verification
      localStorage.setItem('pending_company_data', JSON.stringify(companyData));
    }

    // Check if email confirmation is required
    if (authResponse.session) {
      // User is already logged in (email confirmation disabled)
      router.push('/dashboard');
    } else {
      // Email confirmation required - redirect to verification page
      router.push(`/auth/verify?email=${encodeURIComponent(data.email)}`);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-8 shadow-2xl">
        <CardHeader className="text-center mb-6">
          <CardTitle className="text-3xl font-bold text-[#0052CC]">Register Your Company</CardTitle>
          <p className="text-gray-600 mt-2">GST mandatory • One-time registration</p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input name="company_name" placeholder="Company Name *" required />
            <Input name="contact_person" placeholder="Contact Person Name *" required />
            <Input name="email" type="email" placeholder="Email *" required />
            <Input name="password" type="password" placeholder="Password (min 8 characters) *" required minLength={8} />
            <Input name="phone" placeholder="Phone (with country code) *" required />
            <textarea
              name="address"
              placeholder="Complete Address *"
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              rows={3}
              required
            />
            <Input name="gst_number" placeholder="GST Number *" required />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Input name="gtin_prefix" placeholder="GTIN Prefix (optional)" />
              <Input name="total_skus" type="number" placeholder="Total SKUs (optional)" />
            </div>

            <Select name="industry" required>
              <SelectTrigger>
                <SelectValue placeholder="Industry *" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pharmaceutical">Pharmaceutical</SelectItem>
                <SelectItem value="Packaged Food">Packaged Food</SelectItem>
                <SelectItem value="Dairy Products">Dairy Products</SelectItem>
                <SelectItem value="Others">Others</SelectItem>
              </SelectContent>
            </Select>

            <Select name="business_type" required>
              <SelectTrigger>
                <SelectValue placeholder="Business Type *" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Manufacturer">Manufacturer</SelectItem>
                <SelectItem value="Exporter">Exporter</SelectItem>
                <SelectItem value="Both">Both</SelectItem>
              </SelectContent>
            </Select>

            <Select name="labels_per_month">
              <SelectTrigger>
                <SelectValue placeholder="Labels per month (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="<10k">&lt; 10,000</SelectItem>
                <SelectItem value="10k-50k">10,000 – 50,000</SelectItem>
                <SelectItem value="50k-200k">50,000 – 2,00,000</SelectItem>
                <SelectItem value=">200k">&gt; 2,00,000</SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-lg py-6"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Register & Continue →'}
            </Button>
          </form>

          <p className="text-center mt-8 text-gray-600">
            Already registered?{' '}
            <a href="/auth/signin" className="text-[#0052CC] font-semibold hover:underline">
              Sign In here
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}