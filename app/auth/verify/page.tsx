'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function VerifyEmail() {
  const [email, setEmail] = useState('');

  useEffect(() => {
    // Get email from URL params or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
      localStorage.setItem('pending_verification_email', emailParam);
    } else {
      const storedEmail = localStorage.getItem('pending_verification_email');
      if (storedEmail) setEmail(storedEmail);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <Mail className="h-10 w-10 text-orange-500" />
          </div>
          <CardTitle className="text-3xl font-bold text-[#0052CC]">Verify Your Email</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6 text-center">
          <p className="text-gray-600 text-lg">
            We've sent a verification email to:
          </p>
          <p className="text-xl font-semibold text-[#0052CC] break-all">
            {email || 'your email address'}
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-700">Click the verification link in your email</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-700">Check your spam folder if you don't see it</p>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-700">After verification, you'll be redirected to your dashboard</p>
            </div>
          </div>

          <div className="space-y-3">
            <Link href="/auth/signin">
              <Button className="w-full bg-[#0052CC] hover:bg-blue-700 text-white">
                Go to Sign In
              </Button>
            </Link>

            <p className="text-sm text-gray-500">
              Didn't receive the email?{' '}
              <a href="/auth/signup" className="text-orange-500 font-semibold hover:underline">
                Try signing up again
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
