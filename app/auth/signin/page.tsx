// app/auth/signin/page.tsx
'use client';
import { useState } from 'react';
import { supabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabaseClient().auth.signInWithPassword({ email, password });
    if (!error) router.push('/dashboard');
    else alert(error.message);
    setLoading(false);
  };

  return (
    <Card className="p-8 shadow-2xl">
      <h1 className="text-3xl font-bold text-center mb-8 text-[#0052CC]">Welcome Back</h1>
      <form onSubmit={handleLogin} className="space-y-6">
        <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button className="w-full bg-orange-500 hover:bg-orange-600" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>
      <p className="text-center mt-6 text-gray-600">
        Don't have an account? <a href="/auth/signup" className="text-[#0052CC] font-semibold">Register your company</a>
      </p>
    </Card>
  );
}