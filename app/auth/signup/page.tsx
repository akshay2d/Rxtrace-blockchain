// app/auth/signup/page.tsx
'use client';

import { useState } from 'react';
import { supabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { getAppUrl } from '@/lib/config';

export default function SignUp() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);

    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const fullName = formData.get('full_name') as string;

    try {
      // 1. Create Supabase account
      const { data: authResponse, error: signUpError } = await supabaseClient().auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${getAppUrl()}/dashboard`,
        },
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered') || 
            signUpError.message.includes('User already registered')) {
          setError('This email is already registered. Please sign in instead.');
          setLoading(false);
          setTimeout(() => router.push('/auth/signin'), 2000);
          return;
        }
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (!authResponse.user) {
        setError('Signup failed. Please try again.');
        setLoading(false);
        return;
      }

      // Save user profile
      await fetch('/api/auth/create-user-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          fullName,
          user_id: authResponse.user.id 
        }),
      }).catch(err => console.warn('Profile save failed:', err));

      // 2. Send welcome email (non-blocking)
      fetch('/api/auth/send-welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName }),
      }).catch(err => console.warn('Welcome email failed:', err));

      // 3. Send OTP for verification
      const otpResponse = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!otpResponse.ok) {
        const error = await otpResponse.json();
        setError('Failed to send OTP: ' + (error.error || 'Unknown error'));
        setLoading(false);
        return;
      }

      // 4. Store email in localStorage for verification page
      localStorage.setItem('pending_verification_email', email);
      localStorage.setItem('pending_user_name', fullName);
      // Store password temporarily to auto sign-in after OTP verification
      localStorage.setItem('pending_verification_password', password);

      // 5. Redirect to OTP verification page
      router.push(`/auth/verify?email=${encodeURIComponent(email)}`);
    } catch (error) {
      console.error('Signup error:', error);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 shadow-2xl">
        <CardHeader className="text-center mb-6">
          <CardTitle className="text-3xl font-bold text-[#0052CC]">Create Account</CardTitle>
          <p className="text-gray-600 mt-2">Start your 15-day free trial • No credit card required</p>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input name="full_name" placeholder="Full Name *" required />
            <Input name="email" type="email" placeholder="Email Address *" required />
            <Input 
              name="password" 
              type="password" 
              placeholder="Password (min 8 characters, include letters & numbers) *" 
              required 
              minLength={8}
              autoComplete="new-password"
            />
            <p className="text-xs text-gray-500 -mt-3">
              Password must be at least 8 characters long
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-gray-700">
              <p className="font-semibold mb-2 text-[#0052CC]">📧 Email Verification with OTP</p>
              <p>You&apos;ll receive a 6-digit code to verify your email address.</p>
            </div>

            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-lg py-6"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Create Account & Get OTP'}
            </Button>
          </form>

          <p className="text-center mt-8 text-gray-600">
            Already have an account?{' '}
            <a href="/auth/signin" className="text-[#0052CC] font-semibold hover:underline">
              Sign In
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}