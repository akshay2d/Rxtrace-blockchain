'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FirmType = 'proprietorship' | 'partnership' | 'llp' | 'pvt_ltd' | 'ltd';

export default function SetupCompanyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1 = Profile, 2 = Trial Activation
  const [companyId, setCompanyId] = useState<string>('');
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'growth'>('starter');

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [firmType, setFirmType] = useState<FirmType>('proprietorship');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pan, setPan] = useState('');
  const [gst, setGst] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [businessType, setBusinessType] = useState('');

  // OTP verification
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = supabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/auth/signin');
        return;
      }

      // Check if company profile already exists
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id, company_name, subscription_status, trial_end_date')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingCompany?.id && existingCompany.subscription_status) {
        // Already has subscription or trial - redirect to dashboard
        router.replace('/dashboard');
        return;
      }

      if (existingCompany?.id) {
        setCompanyId(existingCompany.id);
      }

      // Pre-fill email from auth user
      setEmail(user.email || '');
      setLoading(false);
    })();
  }, [router]);

  const sendOTP = async () => {
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setOtpLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send OTP');
        setOtpLoading(false);
        return;
      }

      setOtpSent(true);
      setOtpLoading(false);
      alert('OTP sent to your email!');
    } catch (err) {
      setError('Failed to send OTP. Please try again.');
      setOtpLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }

    setOtpLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid OTP');
        setOtpLoading(false);
        return;
      }

      setEmailVerified(true);
      setOtpLoading(false);
      alert('Email verified successfully!');
    } catch (err) {
      setError('Failed to verify OTP. Please try again.');
      setOtpLoading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    // Validation
    if (!emailVerified) {
      setError('Please verify your email address');
      setSubmitting(false);
      return;
    }

    if (firmType !== 'proprietorship' && !gst.trim()) {
      setError('GST number is mandatory for Partnership/LLP/Pvt Ltd/Ltd');
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
          firm_type: firmType,
          address: address.trim(),
          email: email.trim(),
          phone: phone.trim(),
          pan: pan.trim() || null,
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

      if (out?.company?.id) {
        setCompanyId(String(out.company.id));
      }

      // Move to trial activation step
      setStep(2);
      setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
      setSubmitting(false);
    }
  };

  const startTrial = async () => {
    setSubmitting(true);
    setError('');

    if (!companyId) {
      setError('Company profile is missing. Please go back and save your profile again.');
      setSubmitting(false);
      return;
    }

    try {
      // Load Razorpay
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);

      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Razorpay'));
      });

      // Create ₹5 authorization order
      const res = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 5,
          purpose: `trial_auth_${selectedPlan}`,
        }),
      });

      const body = await res.json();
      const order = body?.order ?? body;
      const keyId = body?.keyId ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      if (!res.ok || !order?.id) {
        setError('Failed to initiate trial. Please try again.');
        setSubmitting(false);
        return;
      }

      const rzp = new (window as any).Razorpay({
        key: keyId,
        order_id: order.id,
        amount: order.amount,
        currency: 'INR',
        name: 'RxTrace India',
        description: '15-Day Free Trial Authorization (₹5 refundable)',
        handler: async (response: any) => {
          // Activate trial
          const activateRes = await fetch('/api/trial/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: companyId,
              plan: selectedPlan,
              payment_id: response.razorpay_payment_id,
              order_id: response.razorpay_order_id,
              signature: response.razorpay_signature,
            }),
          });

          const activateBody = await activateRes.json().catch(() => null);

          if (activateRes.ok) {
            // If a subscription was created, send the user to authorize it so auto-renewal works.
            const shortUrl = activateBody?.subscription?.short_url as string | undefined;
            if (shortUrl) {
              alert('✓ Trial activated. Please authorize the subscription to enable auto-renewal after trial.');
              window.location.href = shortUrl;
              return;
            }

            alert('✓ Trial activated successfully! Welcome to RxTrace.');
            router.replace('/dashboard');
          } else {
            setError('Payment successful but trial activation failed. Contact support.');
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setError('Trial authorization cancelled');
            setSubmitting(false);
          },
        },
        theme: { color: '#0052CC' },
      });

      rzp.open();
    } catch (err: any) {
      setError(err.message || 'Failed to start trial');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl text-[#0052CC]">
              {step === 1 ? 'Company Profile Setup' : 'Start Your Free Trial'}
            </CardTitle>
            <div className="text-sm text-gray-500">Step {step} of 2</div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              {/* Company Name */}
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company Name *"
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

              {/* Email with OTP */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email *"
                    required
                    disabled={submitting || emailVerified}
                    className={emailVerified ? 'bg-green-50 border-green-300' : ''}
                  />
                  {!emailVerified && (
                    <Button
                      type="button"
                      onClick={sendOTP}
                      disabled={otpLoading || emailVerified || !email}
                      variant="outline"
                    >
                      {otpSent ? 'Resend OTP' : 'Send OTP'}
                    </Button>
                  )}
                  {emailVerified && (
                    <Button type="button" disabled className="bg-green-500">
                      ✓ Verified
                    </Button>
                  )}
                </div>

                {otpSent && !emailVerified && (
                  <div className="flex gap-2">
                    <Input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="Enter 6-digit OTP"
                      maxLength={6}
                      disabled={otpLoading}
                    />
                    <Button type="button" onClick={verifyOTP} disabled={otpLoading || otp.length !== 6}>
                      Verify
                    </Button>
                  </div>
                )}
              </div>

              {/* Phone */}
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone Number *"
                required
                disabled={submitting}
              />

              {/* Tax Info - Conditional */}
              {firmType === 'proprietorship' ? (
                <Input
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  placeholder="PAN Card (Optional for Proprietorship)"
                  maxLength={10}
                  disabled={submitting}
                />
              ) : (
                <Input
                  value={gst}
                  onChange={(e) => setGst(e.target.value.toUpperCase())}
                  placeholder="GST Number (Mandatory) *"
                  required
                  maxLength={15}
                  disabled={submitting}
                />
              )}

              {/* Business Category */}
              <Select value={businessCategory} onValueChange={setBusinessCategory} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Category of Business *" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pharma">Pharma</SelectItem>
                  <SelectItem value="food">Food</SelectItem>
                  <SelectItem value="dairy">Dairy</SelectItem>
                  <SelectItem value="logistics">Logistics</SelectItem>
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
                disabled={submitting || !emailVerified || !companyName.trim() || !businessCategory || !businessType}
              >
                {submitting ? 'Saving…' : 'Continue to Trial Activation →'}
              </Button>
            </form>
          ) : (
            // Step 2: Trial Activation
            <div className="space-y-6 text-center">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={selectedPlan === 'starter' ? 'default' : 'outline'}
                  className={selectedPlan === 'starter' ? 'bg-orange-500 hover:bg-orange-600' : ''}
                  onClick={() => setSelectedPlan('starter')}
                  disabled={submitting}
                >
                  Starter (Trial)
                </Button>
                <Button
                  type="button"
                  variant={selectedPlan === 'growth' ? 'default' : 'outline'}
                  className={selectedPlan === 'growth' ? 'bg-orange-500 hover:bg-orange-600' : ''}
                  onClick={() => setSelectedPlan('growth')}
                  disabled={submitting}
                >
                  Growth (Trial)
                </Button>
              </div>

              <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-xl font-semibold text-blue-900 mb-2">15-Day Free Trial</h3>
                <p className="text-sm text-blue-700 mb-4">
                  Test all features with {selectedPlan === 'growth' ? 'Growth' : 'Starter'} plan access. No charges during trial period.
                </p>
                <ul className="text-left text-sm text-blue-800 space-y-2 max-w-md mx-auto">
                  {selectedPlan === 'growth' ? (
                    <>
                      <li>✓ 10,00,000 Unit labels</li>
                      <li>✓ 2,00,000 Box labels</li>
                      <li>✓ 20,000 Carton labels</li>
                      <li>✓ 2,000 Pallet labels</li>
                      <li>✓ 5 User IDs</li>
                      <li>✓ 1 ERP integration</li>
                      <li>✓ Unlimited handsets</li>
                    </>
                  ) : (
                    <>
                      <li>✓ 2,00,000 Unit labels</li>
                      <li>✓ 20,000 Box labels</li>
                      <li>✓ 2,000 Carton labels</li>
                      <li>✓ 500 Pallet labels</li>
                      <li>✓ 1 User ID</li>
                      <li>✓ 1 ERP integration</li>
                      <li>✓ Unlimited handsets</li>
                    </>
                  )}
                </ul>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>₹5 Authorization:</strong> We&apos;ll charge ₹5 to verify your payment method. This amount will be refunded.
                </p>
              </div>

              <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg text-left space-y-2">
                <h4 className="font-semibold text-blue-900">📋 Billing Details</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• <strong>Trial Period:</strong> 15 days, completely free</li>
                  <li>• <strong>After Trial:</strong> {selectedPlan === 'growth' ? '₹49,000/month' : '₹18,000/month'} will be charged automatically</li>
                  <li>• <strong>Auto-Renewal:</strong> Subscription renews automatically via Razorpay</li>
                  <li>• <strong>Cancellation:</strong> Cancel anytime before trial ends - no charges</li>
                  <li>• <strong>Payment Method:</strong> Saved card will be debited automatically</li>
                </ul>
              </div>

              <Button
                onClick={startTrial}
                className="w-full bg-orange-500 hover:bg-orange-600 text-lg py-6"
                disabled={submitting}
              >
                {submitting ? 'Processing…' : 'Authorize ₹5 & Start 15-Day Free Trial'}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                disabled={submitting}
                className="w-full"
              >
                ← Back to Profile
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
