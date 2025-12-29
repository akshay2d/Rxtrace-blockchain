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
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');
  const router = useRouter();

  const testConnection = async () => {
    try {
      const supabase = supabaseClient();
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      setDebugInfo(`URL: ${url ? 'Set ✓' : 'Missing ✗'}\nKey: ${key ? 'Set ✓' : 'Missing ✗'}`);
      
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setDebugInfo(prev => prev + `\nConnection: Failed ✗\nError: ${error.message}`);
      } else {
        setDebugInfo(prev => prev + `\nConnection: Success ✓`);
      }
    } catch (err) {
      setDebugInfo(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

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
        
        // Handle specific error cases
        if (signInError.message.includes('Email not confirmed')) {
          setError('Please verify your email before signing in. Check your inbox for the verification link.');
          alert('⚠️ Email Not Verified\n\nPlease check your email and click the verification link before signing in.');
        } else if (signInError.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.');
          alert('❌ Invalid Credentials\n\nEmail or password is incorrect. Please try again.');
        } else {
          setError(signInError.message);
          alert('Sign in failed: ' + signInError.message);
        }
        setLoading(false);
        return;
      }
      
      if (data?.user) {
        console.log('Sign in successful, user:', data.user.id);
        
        // Check if company exists
        const { data: companyData, error: companyError } = await supabaseClient()
          .from('companies')
          .select('id')
          .eq('user_id', data.user.id)
          .single();
        
        if (companyError || !companyData) {
          console.log('No company found, checking pending data...');
          
          // Check for pending company data
          const pendingData = localStorage.getItem('pending_company_data');
          if (pendingData) {
            const companyInfo = JSON.parse(pendingData);
            const { error: insertError } = await supabaseClient()
              .from('companies')
              .insert(companyInfo);
            
            if (!insertError) {
              localStorage.removeItem('pending_company_data');
              console.log('Company data saved successfully');
            }
          }
        }
        
        console.log('Redirecting to dashboard...');
        router.push('/dashboard');
      } else {
        console.error('No user data returned');
        setError('Sign in failed. Please try again.');
        alert('Sign in failed. Please try again.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Unexpected error during sign in:', err);
      setError('An unexpected error occurred. Please try again.');
      alert('An unexpected error occurred: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address');
      alert('Please enter your email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('Sending password reset email to:', email);
      
      // Get the current URL origin (works for both localhost and production)
      const redirectUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/auth/reset-password`
        : 'https://rxtrace.in/auth/reset-password';
      
      console.log('Redirect URL:', redirectUrl);

      const { data, error: resetError } = await supabaseClient().auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (resetError) {
        console.error('Password reset error:', resetError);
        setError('Failed to send reset email: ' + resetError.message);
        alert('❌ Failed to send reset email\n\n' + resetError.message + '\n\nPlease check:\n1. Email is correct\n2. Account exists\n3. Try again in a few moments');
        setLoading(false);
        return;
      }

      console.log('Password reset email sent successfully');
      setResetEmailSent(true);
      setLoading(false);
      alert('✅ Reset Email Sent!\n\nCheck your email inbox for the password reset link.');
    } catch (err) {
      console.error('Unexpected error during password reset:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError('Failed to send reset email: ' + errorMsg);
      alert('Failed to send reset email. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Card className="p-8 shadow-2xl">
      <h1 className="text-3xl font-bold text-center mb-8 text-[#0052CC]">
        {forgotPasswordMode ? 'Reset Password' : 'Welcome Back'}
      </h1>
      
      {debugInfo && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs font-mono whitespace-pre-wrap">{debugInfo}</p>
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {resetEmailSent && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          <p className="font-semibold mb-2">Reset Email Sent!</p>
          <p className="text-sm">Check your email for a password reset link.</p>
        </div>
      )}
      
      {forgotPasswordMode ? (
        <form onSubmit={handleForgotPassword} className="space-y-6">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
            <Input 
              type="email" 
              placeholder="Email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              disabled={loading || resetEmailSent}
            />
          </div>
          
          {!resetEmailSent && (
            <Button 
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600" 
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          )}

          <button
            type="button"
            onClick={() => {
              setForgotPasswordMode(false);
              setResetEmailSent(false);
              setError('');
            }}
            className="w-full text-[#0052CC] font-semibold hover:underline"
          >
            Back to Sign In
          </button>
        </form>
      ) : (
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
          
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setForgotPasswordMode(true)}
              className="text-sm text-[#0052CC] hover:underline"
            >
              Forgot Password?
            </button>
          </div>

          <Button 
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600" 
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      )}
      
      <p className="text-center mt-6 text-gray-600">
        Don&apos;t have an account? <a href="/auth/signup" className="text-[#0052CC] font-semibold hover:underline">Register your company</a>
      </p>
      
      <button
        onClick={testConnection}
        className="w-full mt-4 text-xs text-gray-500 hover:text-gray-700"
      >
        🔧 Test Supabase Connection
      </button>
    </Card>
  );
}