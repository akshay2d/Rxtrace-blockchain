// app/pricing/page.tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';

export default function Pricing() {
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
      cta: "Current Plan",
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
              <Button
                className={`w-full ${plan.popular ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                disabled={plan.cta === "Current Plan"}
              >
                {plan.cta}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}