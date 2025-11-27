// app/pricing/page.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Pricing() {
  const router = useRouter();

  const handleUpgrade = (planName: string) => {
    if (planName === "Professional" || planName === "Enterprise") {
      // Redirect to dashboard or payment page
      router.push('/dashboard');
    }
  };

  const plans = [
    {
      name: "Free Forever",
      price: "₹0",
      perMonth: "",
      limit: "1,000 labels/month",
      features: [
        "Manual + CSV generation",
        "No API access",
        "No real GS1 prefix",
        "Community support",
      ],
      cta: "Get Started Free",
      ctaLink: "/auth/signup",
      popular: false,
    },
    {
      name: "Professional",
      price: "₹3,999",
      perMonth: "/month",
      limit: "10,000 labels/month",
      extra: "₹0.25 per extra label",
      features: [
        "Real GS1 prefix (you provide)",
        "API access",
        "CSV bulk upload",
        "Email support",
      ],
      cta: "Upgrade Now",
      ctaLink: "/dashboard",
      popular: true,
    },
    {
      name: "Enterprise",
      price: "₹9,999",
      perMonth: "/month",
      limit: "Unlimited labels",
      extra: "₹0.10 per label",
      features: [
        "Full API + SAP/ERP integration",
        "Real GS1 prefix (you provide)",
        "Priority support",
        "Custom branding",
      ],
      cta: "Contact Sales",
      ctaLink: "mailto:sales@rxtrace.in",
      popular: false,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 py-20">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold text-[#0052CC] mb-4">Simple, Transparent Pricing</h1>
        <p className="text-xl text-gray-600">Choose the perfect plan for your business</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={`relative ${plan.popular ? 'border-orange-500 shadow-2xl scale-105' : ''}`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-4 py-1 rounded-full text-sm font-bold">
                MOST POPULAR
              </div>
            )}
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <div className="mt-4">
                <span className="text-5xl font-bold">{plan.price}</span>
                <span className="text-gray-600">{plan.perMonth}</span>
              </div>
              <p className="text-lg mt-2">{plan.limit}</p>
              {plan.extra && <p className="text-sm text-gray-500 mt-1">{plan.extra}</p>}
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {plan.ctaLink.startsWith('mailto:') ? (
                <a href={plan.ctaLink}>
                  <Button
                    className={`w-full ${plan.popular ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                  >
                    {plan.cta}
                  </Button>
                </a>
              ) : (
                <Link href={plan.ctaLink}>
                  <Button
                    className={`w-full ${plan.popular ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="max-w-4xl mx-auto mt-20 px-4">
        <Card className="bg-gradient-to-r from-blue-50 to-orange-50 border-2">
          <CardContent className="p-8">
            <h2 className="text-3xl font-bold text-center mb-4">Need a custom solution?</h2>
            <p className="text-center text-gray-600 mb-6">
              Contact our sales team for enterprise pricing, volume discounts, and custom integrations.
            </p>
            <div className="flex justify-center">
              <a href="mailto:sales@rxtrace.in">
                <Button size="lg" className="bg-[#0052CC] hover:bg-blue-700">
                  Contact Sales Team
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}