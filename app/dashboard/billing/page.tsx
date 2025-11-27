// app/dashboard/billing/page.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useState } from 'react';

export default function Billing() {
  const [loading, setLoading] = useState(false);

  const plans = [
    { id: 'free', name: 'Free Forever', price: 0, limit: 1000 },
    { id: 'pro', name: 'Professional', price: 3999, limit: 10000 },
    { id: 'enterprise', name: 'Enterprise', price: 9999, limit: 100000 },
  ];

  const loadRazorpay = async (plan: any) => {
    setLoading(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      const options = {
        key: 'rzp_test_YOUR_KEY', // ← Replace with your real/test key
        amount: plan.price * 100,
        currency: 'INR',
        name: 'RxTrace India',
        description: `${plan.name} Plan`,
        handler: async (response: any) => {
          // Success → upgrade plan in Supabase
          await fetch('/api/upgrade-plan', {
            method: 'POST',
            body: JSON.stringify({ planId: plan.id, paymentId: response.razorpay_payment_id }),
          });
          alert('Payment successful! Plan upgraded.');
          window.location.reload();
        },
        prefill: { name: 'Customer', email: 'customer@example.com' },
        theme: { color: '#FF6B35' },
      };
      // @ts-ignore
      new window.Razorpay(options).open();
    };
    document.body.appendChild(script);
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto py-10">
      <h1 className="text-4xl font-bold text-[#0052CC] mb-8">Upgrade Plan</h1>
      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card key={plan.id} className="p-6">
            <h3 className="text-2xl font-bold">{plan.name}</h3>
            <p className="text-4xl font-bold my-4">₹{plan.price || 0}<span className="text-lg">/mo</span></p>
            <p className="text-gray-600 mb-6">{plan.limit.toLocaleString()} labels/month</p>
            <Button
              onClick={() => loadRazorpay(plan)}
              disabled={loading || plan.price === 0}
              className="w-full bg-orange-500 hover:bg-orange-600"
            >
              {plan.price === 0 ? 'Current Plan' : 'Upgrade Now'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}