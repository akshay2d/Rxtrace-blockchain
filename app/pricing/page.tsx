"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { loadRazorpay } from "@/lib/razorpay";
import { supabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

/* ===================== TYPES ===================== */

type AddOn = {
  key: string;
  name: string;
  priceLabel: string;
  unitPricePaise: number; // integer paise
  quantityPlaceholder?: string;
};

/* ===================== ADD-ONS ===================== */

const ADDONS: AddOn[] = [
  {
    key: "unit",
    name: "Extra Unit labels",
    priceLabel: "₹0.10 / label",
    unitPricePaise: 10,
    quantityPlaceholder: "e.g. 1L",
  },
  {
    key: "box",
    name: "Extra Box labels",
    priceLabel: "₹0.30 / label",
    unitPricePaise: 30,
    quantityPlaceholder: "e.g. 10K",
  },
  {
    key: "carton",
    name: "Extra Carton labels",
    priceLabel: "₹1.00 / label",
    unitPricePaise: 100,
    quantityPlaceholder: "e.g. 1K",
  },
  {
    key: "pallet",
    name: "Extra Pallet labels (SSCC)",
    priceLabel: "₹2.00 / label",
    unitPricePaise: 200,
    quantityPlaceholder: "e.g. 500",
  },
  {
    key: "userid",
    name: "Additional User ID (Seat)",
    priceLabel: "₹3,000 / month",
    unitPricePaise: 3000 * 100,
    quantityPlaceholder: "e.g. 1",
  },
  // ERP removed: 1 ERP integration per User ID is FREE (not sold as add-on)
];

function parseQuantity(input: string): number | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  const cleaned = raw.replace(/,/g, "").replace(/\s+/g, "").toUpperCase();
  const match = cleaned.match(/^([0-9]*\.?[0-9]+)([KLM]?)$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const suffix = match[2];
  const multiplier = suffix === "K" ? 1_000 : suffix === "L" ? 100_000 : suffix === "M" ? 1_000_000 : 1;

  const qty = Math.round(value * multiplier);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return qty;
}

function formatINRFromPaise(paise: number): string {
  const inr = paise / 100;
  return `₹${inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ================================================== */
/* ===================== PAGE ======================= */
/* ================================================== */

type Plan = {
  id: string;
  name: string;
  description: string | null;
  billing_cycle: string;
  base_price: number;
  items: Array<{ label: string; value: string | null }>;
};

type AddOnAPI = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  recurring: boolean;
};

export default function PricingPage() {
  const router = useRouter();
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [company, setCompany] = React.useState<any>(null);
  const [subscription, setSubscription] = React.useState<any>(null);
  const [cart, setCart] = React.useState<Record<string, number>>({});
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);
  const [checkoutMessage, setCheckoutMessage] = React.useState<string | null>(null);
  const [trialMessage, setTrialMessage] = React.useState<string | null>(null);
  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [addOns, setAddOns] = React.useState<AddOnAPI[]>([]);
  const [loadingPlans, setLoadingPlans] = React.useState(true);

  const [qtyByKey, setQtyByKey] = React.useState<Record<string, string>>({});

  // Fetch plans and add-ons from public APIs
  React.useEffect(() => {
    (async () => {
      try {
        const [plansRes, addOnsRes] = await Promise.all([
          fetch('/api/public/plans'),
          fetch('/api/public/add-ons'),
        ]);
        
        const plansData = await plansRes.json();
        const addOnsData = await addOnsRes.json();
        
        if (plansData.success) {
          setPlans(plansData.plans || []);
        }
        if (addOnsData.success) {
          setAddOns(addOnsData.add_ons || []);
          // Initialize qtyByKey for add-ons
          const initialQty: Record<string, string> = {};
          addOnsData.add_ons?.forEach((ao: AddOnAPI) => {
            const key = ao.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            initialQty[key] = '';
          });
          setQtyByKey(initialQty);
        }
      } catch (err) {
        console.error('Failed to fetch plans/add-ons:', err);
      } finally {
        setLoadingPlans(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseClient();
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) return;

        // Fetch company data
        const { data: company } = await supabase
          .from("companies")
          .select("id, subscription_status, trial_start_date, trial_end_date, trial_activated_at")
          .eq("user_id", user.id)
          .maybeSingle();

        // Fetch subscription data from API (same source as billing page)
        let subscriptionData = null;
        try {
          const subRes = await fetch('/api/user/subscription', { cache: 'no-store' });
          if (subRes.ok) {
            const subBody = await subRes.json();
            subscriptionData = subBody.subscription || null;
            console.log('[Pricing] Subscription data:', subscriptionData);
          } else {
            console.error('[Pricing] Subscription API error:', subRes.status, await subRes.text());
          }
        } catch (subErr) {
          console.error('[Pricing] Failed to fetch subscription:', subErr);
        }

        if (!cancelled) {
          setCompany(company ?? null);
          setCompanyId((company as any)?.id ?? null);
          setSubscription(subscriptionData);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- START FREE TRIAL (₹5 AUTH) ---------- */
  async function startFreeTrial() {
    setTrialMessage(null);

    // Check if user needs to set up company first
    if (!companyId) {
      router.push('/dashboard/company-setup');
      return;
    }

    // If trial or subscription already exists, send to billing
    if (company?.subscription_status) {
      router.push('/dashboard/billing');
      return;
    }

    const ok = await loadRazorpay();
    if (!ok) {
      setTrialMessage('Razorpay failed to load. Please refresh and try again.');
      return;
    }

    const res = await fetch("/api/razorpay/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 5, purpose: "trial_auth" }),
    });

    const body = await res.json();
    const order = body?.order ?? body;
    const keyId = body?.keyId ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

    if (!res.ok || !order?.id) {
      setTrialMessage(order?.error || body?.error || "Failed to create order");
      return;
    }
    if (!keyId) {
      setTrialMessage("Razorpay key not configured (NEXT_PUBLIC_RAZORPAY_KEY_ID)");
      return;
    }

    new (window as any).Razorpay({
      key: keyId,
      order_id: order.id,
      amount: order.amount,
      currency: "INR",
      name: "RxTrace",
      description: "15-day Free Trial Authorization (₹5 refundable)",
      handler: async (response: any) => {
        try {
          // Activate trial with payment details
          const activateRes = await fetch('/api/trial/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: companyId,
              plan: 'starter',
              payment_id: response.razorpay_payment_id,
              order_id: response.razorpay_order_id,
              signature: response.razorpay_signature,
            }),
          });

          const activateBody = await activateRes.json().catch(() => null);

          if (activateRes.ok) {
            // Force refresh auth session to get updated company subscription status
            await supabaseClient().auth.refreshSession();
            
            // Wait a moment for session to update
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Redirect to dashboard - middleware will route appropriately
            router.push('/dashboard');
          } else {
            setTrialMessage('Payment successful but trial activation failed. Please contact support.');
            console.error('Trial activation error:', activateBody);
          }
        } catch (err) {
          setTrialMessage('Payment processed but activation failed. Please contact support.');
          console.error('Activation error:', err);
        }
      },
      modal: {
        ondismiss: () => {
          setTrialMessage('Payment cancelled. Please try again to activate your free trial.');
        },
      },
      theme: { color: "#0052CC" },
    }).open();
  }

  const trialEligible = Boolean(companyId && !company?.subscription_status);
  const trialDisabledReason = !companyId
    ? 'Complete company setup to start your free trial.'
    : company?.subscription_status
    ? 'Trial already active. Manage subscription in Billing.'
    : null;

  /* ---------- SUBSCRIBE TO PLAN (UPGRADE FROM TRIAL) ---------- */
  async function subscribeToPlan(plan: Plan) {
    setTrialMessage(null);
    setCheckoutMessage(null);

    if (!companyId) {
      setTrialMessage('Please complete company setup first.');
      router.push('/dashboard/company-setup');
      return;
    }

    // Check if user is in trial (check both company table and subscription table)
    const isTrial = (company?.subscription_status === 'trial' || company?.subscription_status === 'TRIAL') ||
                    (subscription?.status === 'TRIAL');
    
    if (!isTrial) {
      setTrialMessage('You are not in trial. Redirecting to billing...');
      setTimeout(() => router.push('/dashboard/billing'), 1000);
      return;
    }

    const ok = await loadRazorpay();
    if (!ok) {
      setTrialMessage('Razorpay failed to load. Please refresh and try again.');
      return;
    }

    // Normalize plan name to match API expectations (starter, growth, enterprise)
    const planKey = plan.name.toLowerCase().replace(/\s+/g, '_');
    const normalizedPlan = planKey.includes('starter') ? 'starter' : 
                           planKey.includes('growth') ? 'growth' : 
                           planKey.includes('enterprise') ? 'enterprise' : 'starter';

    setTrialMessage('Processing subscription...');
    
    try {
      // Create/upgrade subscription via API
      const res = await fetch('/api/billing/subscription/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: normalizedPlan }),
      });

      const body = await res.json();
      if (!res.ok) {
        setTrialMessage(body?.error || 'Failed to create subscription. Please try again.');
        console.error('Subscription upgrade error:', body);
        return;
      }

      if (!body.subscription || !body.subscription.id) {
        setTrialMessage('Subscription created but payment link not available. Please contact support.');
        return;
      }

      const subscriptionData = body.subscription;
      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      if (!keyId) {
        setTrialMessage('Razorpay key not configured. Please contact support.');
        return;
      }

      setTrialMessage(null); // Clear message before opening payment

      // Open Razorpay subscription payment modal
      if (subscriptionData.short_url) {
        // Use short_url if available (Razorpay subscription link)
        window.location.href = subscriptionData.short_url;
      } else if (subscriptionData.id) {
        // Use Razorpay Checkout for subscription
        new (window as any).Razorpay({
          key: keyId,
          subscription_id: subscriptionData.id,
          name: 'RxTrace',
          description: `Subscribe to ${plan.name} Plan`,
          handler: async (response: any) => {
            try {
              setTrialMessage('Payment successful! Updating subscription...');
              // Refresh session and redirect to billing
              await supabaseClient().auth.refreshSession();
              await new Promise(resolve => setTimeout(resolve, 1000));
              router.push('/dashboard/billing');
            } catch (err) {
              setTrialMessage('Payment successful. Please refresh the page to see your subscription.');
            }
          },
          modal: {
            ondismiss: () => {
              setTrialMessage('Payment cancelled. You can try again anytime.');
            },
          },
          theme: { color: '#0052CC' },
        }).open();
      } else {
        setTrialMessage('Payment link not available. Please contact support.');
      }
    } catch (err: any) {
      setTrialMessage(err?.message || 'Failed to process subscription. Please try again.');
      console.error('Subscription error:', err);
    }
  }

  const cartItems = React.useMemo(() => {
    const items = Object.entries(cart)
      .map(([key, qty]) => {
        const addon = addOns.find((a) => {
          const addonKey = a.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
          return addonKey === key;
        });
        if (!addon) return null;
        const quantity = Number(qty);
        if (!Number.isInteger(quantity) || quantity <= 0) return null;
        const totalPaise = quantity * Math.round(addon.price * 100);
        return { addon, qty: quantity, totalPaise };
      })
      .filter(Boolean) as Array<{ addon: AddOnAPI; qty: number; totalPaise: number }>;

    items.sort((a, b) => a.addon.name.localeCompare(b.addon.name));
    return items;
  }, [cart, addOns]);

  const cartTotalPaise = React.useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.totalPaise, 0);
  }, [cartItems]);

  function addToCart(addon: AddOnAPI, qty: number) {
    setCheckoutMessage(null);
    
    // Validate quantity
    if (!Number.isInteger(qty) || qty <= 0) {
      setCheckoutMessage(`Invalid quantity: ${qty}. Please enter a positive number.`);
      return;
    }
    
    const key = addon.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    
    // Use functional update and create new object reference
    setCart((prev) => {
      // Create completely new object to force React re-render
      const newCart = Object.assign({}, prev);
      newCart[key] = qty;
      
      console.log('[Cart] State update:', { 
        addonName: addon.name, 
        key, 
        qty,
        prevCartKeys: Object.keys(prev),
        prevCartValues: Object.values(prev),
        newCartKeys: Object.keys(newCart),
        newCartValues: Object.values(newCart),
        isNewObject: newCart !== prev
      });
      
      return newCart;
    });
    
    // Clear quantity input after adding
    setTimeout(() => {
      setQtyByKey((prev) => {
        const updated = { ...prev };
        updated[key] = '';
        return updated;
      });
    }, 50);
  }

  function removeFromCart(key: string) {
    setCheckoutMessage(null);
    setCart((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function clearCart() {
    setCheckoutMessage(null);
    setCart({});
  }

  async function checkoutCart() {
    setCheckoutMessage(null);

    // ALWAYS recalculate from cart state to ensure we have latest data
    // Don't rely on memoized cartItems - recalculate fresh
    const currentCartItems = Object.entries(cart)
      .map(([key, qty]) => {
        const addon = addOns.find((a) => {
          const addonKey = a.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
          return addonKey === key;
        });
        if (!addon) {
          console.warn('[Cart] Addon not found for key:', key, 'Available:', addOns.map(a => a.name));
          return null;
        }
        const quantity = Number(qty);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          console.warn('[Cart] Invalid quantity:', qty, 'for key:', key);
          return null;
        }
        return { addon, qty: quantity };
      })
      .filter(Boolean) as Array<{ addon: AddOnAPI; qty: number }>;

    console.log('[Cart] Checkout - Fresh calculation:', { 
      cart: cart,
      cartKeys: Object.keys(cart), 
      cartValues: Object.values(cart),
      cartItemsMemoLength: cartItems.length,
      addOnsCount: addOns.length, 
      calculatedItemsCount: currentCartItems.length,
      calculatedItems: currentCartItems 
    });

    if (currentCartItems.length === 0) {
      const errorMsg = `Cart is empty. Cart: ${JSON.stringify(cart)}, CartItems memo: ${cartItems.length}, AddOns: ${addOns.length}`;
      console.error('[Cart]', errorMsg);
      setCheckoutMessage("Cart is empty. Please add items to cart first.");
      return;
    }

    const ok = await loadRazorpay();
    if (!ok) {
      setCheckoutMessage("Razorpay failed to load.");
      return;
    }

    if (!companyId) {
      setCheckoutMessage("Please sign in and complete company setup before purchasing add-ons.");
      return;
    }

    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/addons/cart/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          items: currentCartItems.map((i) => {
            const key = i.addon.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            return { kind: key, qty: i.qty };
          }),
        }),
      });

      const body = await res.json().catch(() => ({}));
      const order = body?.order ?? body;
      const keyId = body?.keyId ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      if (!res.ok || !order?.id) {
        setCheckoutMessage(body?.error || order?.error || "Failed to create cart order.");
        return;
      }
      if (!keyId) {
        setCheckoutMessage("Razorpay key not configured (NEXT_PUBLIC_RAZORPAY_KEY_ID).");
        return;
      }

      new (window as any).Razorpay({
        key: keyId,
        order_id: order.id,
        amount: order.amount,
        currency: "INR",
        name: "RxTrace",
        description: `Add-ons cart (${currentCartItems.length} item${currentCartItems.length === 1 ? "" : "s"})`,
        handler: async (response: any) => {
          try {
            const activateRes = await fetch("/api/addons/activate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payment_id: response?.razorpay_payment_id,
                order_id: response?.razorpay_order_id,
                signature: response?.razorpay_signature,
              }),
            });

            const activateBody = await activateRes.json().catch(() => ({}));
            if (!activateRes.ok || !activateBody?.success) {
              setCheckoutMessage(
                activateBody?.error ||
                  "Payment succeeded, but add-on activation failed. Please contact support."
              );
              return;
            }

            clearCart();
            setCheckoutMessage("✅ Add-ons activated successfully.");
          } catch {
            setCheckoutMessage("Payment succeeded, but activation failed. Please contact support.");
          }
        },
        theme: { color: "#000000" },
      }).open();
    } catch (e: any) {
      setCheckoutMessage(e?.message ?? "Checkout failed.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <main className="bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur bg-white/80 border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
            <Image src="/logo.png" alt="RxTrace" width={36} height={36} />
            <span className="font-semibold text-lg">RxTrace</span>
          </Link>
          <nav className="hidden md:flex gap-8 text-sm font-medium">
            <Link href="/compliance">Compliance</Link>
            <Link href="/services">Services</Link>
            <Link href="/pricing" className="text-blue-600">Pricing</Link>
            <Link href="/contact">Contact Us</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/auth/signin" className="text-sm">Log in</Link>
            <Link href="/auth/signup" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm shadow hover:bg-blue-700">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative bg-gradient-to-br from-blue-700 to-blue-500 text-white">
        <div className="max-w-7xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl md:text-5xl font-bold">
          Simple pricing. Full access. Massive savings.
        </h1>
        <p className="mt-4 text-blue-100 text-lg">
          GS1-compliant • Unlimited handsets • ERP-agnostic
        </p>
        </div>
      </section>


      {trialMessage && (
        <div className="max-w-7xl mx-auto px-6 pb-2">
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
            {trialMessage}
          </div>
        </div>
      )}

      {/* PLANS */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        {loadingPlans ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading plans...</p>
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No plans available at the moment.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => {
              const monthlyPlan = plans.find(p => p.name === plan.name && p.billing_cycle === 'monthly');
              const yearlyPlan = plans.find(p => p.name === plan.name && p.billing_cycle === 'yearly');
              
              // Show monthly if available, otherwise show the plan itself
              const displayPlan = plan.billing_cycle === 'monthly' ? plan : monthlyPlan || plan;
              const yearly = yearlyPlan;
              
              const price = `₹${displayPlan.base_price.toLocaleString('en-IN')} / month`;
              const yearlyPrice = yearly ? `₹${yearly.base_price.toLocaleString('en-IN')} / year` : '';
              const savings = yearly && monthlyPlan 
                ? `Save ₹${((monthlyPlan.base_price * 12) - yearly.base_price).toLocaleString('en-IN')} / year`
                : '';
              
              const items = plan.items.map(item => 
                item.value ? `${item.label}: ${item.value}` : item.label
              );
              
              return (
                <PlanCard
                  key={plan.id}
                  title={plan.name}
                  price={price}
                  yearly={yearlyPrice}
                  savings={savings}
                  items={items}
                  highlight={plan.name.toLowerCase().includes('growth') || plan.name.toLowerCase().includes('popular')}
                  actionLabel={(() => {
                    // Check trial status from both sources
                    const isTrial = (company?.subscription_status === 'trial' || company?.subscription_status === 'TRIAL') || 
                                   (subscription?.status === 'TRIAL');
                    const hasSubscription = company?.subscription_status || subscription?.status;
                    
                    console.log('[Pricing] Plan button logic:', { 
                      planName: plan.name,
                      companyStatus: company?.subscription_status, 
                      subscriptionStatus: subscription?.status,
                      isTrial,
                      hasSubscription
                    });
                    
                    if (isTrial) return `Subscribe to ${plan.name}`;
                    if (hasSubscription) return "Go to Billing";
                    return "Start Free Trial";
                  })()}
                  onAction={(() => {
                    // Check trial status from both sources
                    const isTrial = (company?.subscription_status === 'trial' || company?.subscription_status === 'TRIAL') || 
                                   (subscription?.status === 'TRIAL');
                    const hasSubscription = company?.subscription_status || subscription?.status;
                    
                    if (isTrial) return () => subscribeToPlan(plan);
                    if (hasSubscription) return () => router.push('/dashboard/billing');
                    return startFreeTrial;
                  })()}
                  disabled={!trialEligible}
                  disabledReason={trialDisabledReason}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* BILLING POLICY */}
      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-gradient-to-r from-blue-50 to-orange-50 border-2 border-blue-200 rounded-xl p-8">
          <h2 className="text-2xl font-bold text-center text-blue-900 mb-6">💳 Transparent Billing Policy</h2>
          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-blue-800 mb-1">15-Day Free Trial</h3>
                <p className="text-slate-700">Full access to all plan features. ₹5 authorization (refunded) required to verify payment method.</p>
              </div>
              <div>
                <h3 className="font-semibold text-blue-800 mb-1">After Trial Ends</h3>
                <p className="text-slate-700">Subscription fee charged automatically via Razorpay based on selected plan.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-blue-800 mb-1">Auto-Renewal System</h3>
                <p className="text-slate-700">Automated recurring debit from saved payment method. No manual intervention needed.</p>
              </div>
              <div>
                <h3 className="font-semibold text-blue-800 mb-1">Payment Security</h3>
                <p className="text-slate-700">All payments secured by Razorpay. Your card details are never stored on our servers.</p>
              </div>
            </div>
          </div>

          {/* Cancellation Policy - Mandatory & Prominent */}
          <div className="mt-6 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
            <h3 className="font-bold text-red-900 mb-2">🚨 CANCELLATION POLICY (MANDATORY)</h3>
            <ul className="text-sm text-red-800 space-y-1">
              <li>• <strong>During Trial:</strong> Cancel anytime before 15 days end - absolutely zero charges</li>
              <li>• <strong>After Trial:</strong> Cancel anytime from dashboard before next billing cycle</li>
              <li>• <strong>How to Cancel:</strong> Dashboard → Billing → Cancel Subscription button</li>
              <li>• <strong>Refunds:</strong> No refunds for partial billing periods. Cancel before renewal date to avoid next charge</li>
              <li>• <strong>Access:</strong> Service remains active until end of paid period after cancellation</li>
            </ul>
          </div>

          {/* All Plan Pricing */}
          <div className="mt-6 p-4 bg-white border border-blue-300 rounded-lg">
            <h3 className="font-bold text-blue-900 mb-3">📋 Complete Plan Pricing</h3>
            <div className="space-y-2 text-sm text-gray-700">
              <div>
                <p className="font-semibold text-blue-800">Starter Plan:</p>
                <p>• Monthly: ₹18,000/month</p>
                <p>• Annual: ₹2,00,000/year (Save ₹16,000/month)</p>
              </div>
              <div>
                <p className="font-semibold text-blue-800">Growth Plan:</p>
                <p>• Monthly: ₹49,000/month</p>
                <p>• Annual: ₹5,00,000/year (Save ₹88,000/year)</p>
              </div>
              <div>
                <p className="font-semibold text-blue-800">Enterprise Plan:</p>
                <p>• Monthly: ₹2,00,000/month</p>
                <p>• Quarterly: ₹5,00,000/quarter (₹1,66,667/month avg)</p>
                <p>• Annual equivalent: ₹20,00,000/year</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ADD-ONS */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center">
          Optional Add-ons (Enable anytime)
        </h2>
        <p className="mt-3 text-center text-slate-600">
          Purchase additional resources beyond your subscription plan limits.
        </p>

        <div className="mt-10 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-4">Add-on</th>
                <th className="p-4">Price</th>
                <th className="p-4">Quantity</th>
                <th className="p-4">Total</th>
                <th className="p-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {addOns.map((addon) => {
                const key = addon.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                const qty = parseQuantity(qtyByKey[key] ?? "");
                const totalPaise = qty ? Math.round(qty * addon.price * 100) : null;
                const inCartQty = cart[key];
                const priceLabel = `₹${addon.price.toLocaleString('en-IN')} / ${addon.unit}`;

                return (
                  <tr key={addon.id} className="border-t border-slate-200">
                    <td className="p-4">{addon.name}</td>
                    <td className="p-4">{priceLabel}</td>
                    <td className="p-4">
                      <input
                        value={qtyByKey[key] ?? ""}
                        onChange={(e) =>
                          setQtyByKey((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder="e.g. 1"
                        className="w-32 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                      {inCartQty ? (
                        <div className="text-xs text-slate-500 mt-1">In cart: {inCartQty}</div>
                      ) : null}
                    </td>
                    <td className="p-4">
                      {totalPaise === null ? "—" : formatINRFromPaise(totalPaise)}
                    </td>
                    <td className="p-4">
                      <button
                        disabled={!qty}
                        onClick={() => qty && addToCart(addon, qty)}
                        className="border border-slate-300 px-4 py-1.5 rounded-md text-sm hover:bg-blue-600 hover:text-white hover:border-blue-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-900 disabled:hover:border-slate-300"
                      >
                        {inCartQty ? "Update cart" : "Add to cart"}
                      </button>
                      {inCartQty ? (
                        <button
                          type="button"
                          onClick={() => removeFromCart(key)}
                          className="ml-3 text-sm text-slate-600 hover:text-slate-900 underline"
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* CART */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-orange-50 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Cart</h3>
              <p className="text-sm text-slate-600">Review selected add-ons and checkout once.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={clearCart}
                disabled={Object.keys(cart).length === 0 || checkoutLoading}
                className="text-sm underline text-slate-700 disabled:opacity-50"
              >
                Clear cart
              </button>
              <button
                type="button"
                onClick={checkoutCart}
                disabled={Object.keys(cart).length === 0 || checkoutLoading}
                className="px-5 py-2.5 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkoutLoading ? "Processing…" : Object.keys(cart).length === 0 ? "Add items to cart" : `Checkout (${formatINRFromPaise(cartTotalPaise)})`}
              </button>
            </div>
          </div>

          {checkoutMessage ? (
            <div
              className={`mt-4 rounded-lg border p-3 text-sm ${
                checkoutMessage.includes("✅")
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-red-50 border-red-200 text-red-800"
              }`}
            >
              {checkoutMessage}
            </div>
          ) : null}

          {Object.keys(cart).length === 0 ? (
            <div className="mt-4 text-sm text-slate-600">No items added yet.</div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3">Item</th>
                    <th className="p-3">Qty</th>
                    <th className="p-3">Subtotal</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cartItems.map((item) => {
                    const key = item.addon.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                    return (
                      <tr key={item.addon.id} className="border-t border-slate-200">
                        <td className="p-3">
                          <div className="font-medium text-slate-900">{item.addon.name}</div>
                          <div className="text-xs text-slate-500">₹{item.addon.price.toLocaleString('en-IN')} / {item.addon.unit}</div>
                        </td>
                        <td className="p-3">{item.qty}</td>
                        <td className="p-3 font-medium">{formatINRFromPaise(item.totalPaise)}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => removeFromCart(key)}
                            disabled={checkoutLoading}
                            className="text-sm underline text-slate-700 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex items-center justify-between p-4 border-t border-slate-200 bg-slate-50">
                <div className="text-sm text-slate-600">Grand total</div>
                <div className="text-lg font-bold text-slate-900">{formatINRFromPaise(cartTotalPaise)}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* INCLUDED FREE */}
      <section className="bg-slate-50 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center">
            Included Free in Every Plan
          </h2>

          <div className="mt-10 grid md:grid-cols-2 gap-6 text-slate-600">
            <ul className="space-y-3">
              <li>✔ Unlimited handset scanning</li>
              <li>✔ GS1-compliant serialization</li>
              <li>✔ QR / DataMatrix (Unit → Pallet)</li>
              <li>✔ Ready-to-print formats</li>
              <li>✔ Custom GTIN support</li>
            </ul>

            <ul className="space-y-3">
              <li>✔ Free audit & traceability reports</li>
              <li>✔ Billing & usage transparency</li>
              <li>✔ User activity logs</li>
              <li>✔ CDSCO / USFDA / EU-FMD ready</li>
              <li>✔ ERP included in all plans</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FOOTER + PAYMENT POLICY */}
      <footer className="bg-white border-t border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-10 text-slate-600 text-sm">

          <div>
            <h3 className="text-slate-900 font-semibold mb-3">
              Payment & Trial Policy
            </h3>
            <ul className="space-y-2">
              <li>• 15-day free trial requires payment authorization (₹5 test charge).</li>
              <li>• No charges are applied during the trial period.</li>
              <li>• Subscription billing starts automatically after trial expiry.</li>
              <li>• Add-ons are charged only when explicitly enabled by the user.</li>
              <li>• All prices are exclusive of applicable GST.</li>
              <li>• Payments are processed securely via Razorpay.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-slate-900 font-semibold mb-3">
              RxTrace Platform
            </h3>
            <ul className="space-y-2">
              <li>• GS1-compliant serialization & traceability</li>
              <li>• ERP-agnostic architecture (no vendor lock-in)</li>
              <li>• Audit-ready & regulator-aligned workflows</li>
              <li>• Built for CDSCO, USFDA, EU-FMD compliance</li>
            </ul>
          </div>

        </div>

        <div className="text-center text-slate-500 text-xs mt-12">
          © {new Date().getFullYear()} RxTrace India. All rights reserved.
        </div>
      </footer>

    </main>
  );
}

/* ================================================== */
/* ================= PLAN CARD ====================== */
/* ================================================== */

function PlanCard({
  title,
  price,
  yearly,
  items,
  savings,
  actionLabel,
  onAction,
  disabled = false,
  disabledReason,
  highlight = false,
}: {
  title: string;
  price: string;
  yearly: string;
  items: string[];
  savings: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-8 border ${
        highlight
          ? "border-blue-600 bg-white"
          : "border-slate-200 bg-white"
      }`}
    >
      <h3 className="text-2xl font-bold">{title}</h3>
      <p className="mt-4 text-3xl font-bold">{price}</p>
      <p className="text-slate-600">{yearly}</p>

      <ul className="mt-6 space-y-2 text-slate-600">
        {items.map((item) => (
          <li key={item}>✔ {item}</li>
        ))}
      </ul>

      <div className="mt-6 text-sm text-emerald-700 font-semibold">
        {savings}
      </div>

      <button
        onClick={onAction}
        disabled={disabled}
        className={`mt-8 w-full py-3 rounded-lg font-semibold transition ${
          disabled
            ? "bg-slate-200 text-slate-500 cursor-not-allowed"
            : highlight
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "border border-slate-300 hover:bg-blue-600 hover:text-white hover:border-blue-600"
        }`}
      >
        {actionLabel}
      </button>

      {disabledReason && (
        <p className="mt-3 text-xs text-slate-600">{disabledReason}</p>
      )}
    </div>
  );
}
