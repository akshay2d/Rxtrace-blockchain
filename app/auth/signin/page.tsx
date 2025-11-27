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
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      console.log('Attempting sign in for:', email);
      const { data, error: signInError } = await supabaseClient().auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (signInError) {
        console.error('Sign in error:', signInError);
        setError(signInError.message);
        alert(signInError.message);
        setLoading(false);
        return;
      }
      
      if (data?.user) {
        console.log('Sign in successful, user:', data.user.id);
        console.log('Redirecting to dashboard...');
        router.push('/dashboard');
      } else {
        console.error('No user data returned');
        setError('Sign in failed. Please try again.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Unexpected error during sign in:', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Card className="p-8 shadow-2xl">
      <h1 className="text-3xl font-bold text-center mb-8 text-[#0052CC]">Welcome Back</h1>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      
      <form onSubmit={handleLogin} className="space-y-6">
        <Input 
          type="email" 
          placeholder="Email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          required 
          disabled={loading}
        />
        <Input 
          type="password" 
          placeholder="Password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          required 
          disabled={loading}
        />
        <Button 
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600" 
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>
      <p className="text-center mt-6 text-gray-600">
        Don't have an account? <a href="/auth/signup" className="text-[#0052CC] font-semibold hover:underline">Register your company</a>
      </p>
    </Card>
  );
}