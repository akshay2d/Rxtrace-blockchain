'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function SetupCompanyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = supabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/auth/signin');
        return;
      }

      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id, company_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingCompany?.id) {
        router.replace('/dashboard');
        return;
      }

      setLoading(false);
    })();
  }, [router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const supabase = supabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/auth/signin');
        return;
      }

      const res = await fetch('/api/setup/create-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          company_name: companyName.trim(),
        }),
      });

      const out = await res.json().catch(() => ({}));

      if (!res.ok) {
        // If company already exists, just continue to dashboard.
        if (typeof out?.error === 'string' && out.error.toLowerCase().includes('already exists')) {
          router.replace('/dashboard');
          return;
        }
        setError(out?.error || 'Failed to create company');
        setSubmitting(false);
        return;
      }

      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create company');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-sm text-gray-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="text-2xl text-[#0052CC]">Set up your company</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company Name *"
              required
              disabled={submitting}
            />

            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600"
              disabled={submitting || !companyName.trim()}
            >
              {submitting ? 'Creating…' : 'Create Company & Continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
