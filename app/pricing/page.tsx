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

// Single source of truth for add-on cart key (must match API add-on names)
function getAddonKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

// Map cart/addon key to create-order API kind (API only accepts: unit | box | carton | pallet | userid)
function addonKeyToApiKind(key: string): "unit" | "box" | "carton" | "pallet" | "userid" | null {
  const k = key.toLowerCase();
  if (k === "unit" || k.includes("unit_label")) return "unit";
  if (k === "box" || k.includes("box_label")) return "box";
  if (k === "carton" || k.includes("carton_label")) return "carton";
  if (k === "pallet" || k.includes("pallet") || k.includes("sscc")) return "pallet";
  if (k === "userid" || k.includes("user_id") || k.includes("seat")) return "userid";
  return null;
}

const CART_STORAGE_KEY = "rxtrace_pricing_cart";

// Calculate discounted price from company discount
function calculateDiscountedPrice(
  basePrice: number,
  discount: { discount_type: 'percentage' | 'flat' | null; discount_value: number | null; discount_applies_to: 'subscription' | 'addon' | 'both' | null } | null
): { originalPrice: number; discountedPrice: number; discountAmount: number; hasDiscount: boolean } {
  if (!discount || !discount.discount_type || discount.discount_value === null) {
    return { originalPrice: basePrice, discountedPrice: basePrice, discountAmount: 0, hasDiscount: false };
  }

  // Check if discount applies to subscription
  if (discount.discount_applies_to !== 'subscription' && discount.discount_applies_to !== 'both') {
    return { originalPrice: basePrice, discountedPrice: basePrice, discountAmount: 0, hasDiscount: false };
  }

  let discountAmount = 0;
  if (discount.discount_type === 'percentage') {
    discountAmount = (basePrice * discount.discount_value) / 100;
  } else if (discount.discount_type === 'flat') {
    discountAmount = discount.discount_value;
  }

  const discountedPrice = Math.max(0, basePrice - discountAmount);
  return { originalPrice: basePrice, discountedPrice, discountAmount, hasDiscount: true };
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
  const [companyDiscount, setCompanyDiscount] = React.useState<{
    discount_type: 'percentage' | 'flat' | null;
    discount_value: number | null;
    discount_applies_to: 'subscription' | 'addon' | 'both' | null;
  } | null>(null);

  // Billing cycle selection: monthly vs annual (separate subscription options)
  const [selectedBillingCycle, setSelectedBillingCycle] = React.useState<'monthly' | 'yearly'>('monthly');

  // Coupon codes (admin-created, assigned to company): optional at checkout
  const [subscriptionCouponCode, setSubscriptionCouponCode] = React.useState('');
  const [cartCouponCode, setCartCouponCode] = React.useState('');

  // Phase 7: Backend-calculated amount preview (subscription and cart)
  type SubscriptionPreview = {
    finalAmount: number;
    basePrice: number;
    discountAmount: number;
    couponDiscountAmount: number;
    taxAmount: number;
    hasGST: boolean;
    breakdown: { base: number; discount: number; coupon: number; subtotalAfterCoupon: number; tax: number; total: number };
  };
  const [previewByPlan, setPreviewByPlan] = React.useState<Record<string, SubscriptionPreview | null>>({});
  const [previewLoading, setPreviewLoading] = React.useState(false);
  type CartPreview = { subtotalInr: number; couponDiscountInr: number; orderAmountInr: number; hasCoupon: boolean };
  const [cartPreview, setCartPreview] = React.useState<CartPreview | null>(null);
  const [cartPreviewLoading, setCartPreviewLoading] = React.useState(false);

  const [qtyByKey, setQtyByKey] = React.useState<Record<string, string>>({});

  // Fetch plans and add-ons from public APIs (no cache so admin name changes show immediately)
  React.useEffect(() => {
    (async () => {
      try {
        const [plansRes, addOnsRes] = await Promise.all([
          fetch('/api/public/plans', { cache: 'no-store' }),
          fetch('/api/public/add-ons', { cache: 'no-store' }),
        ]);
        
        const plansData = await plansRes.json();
        const addOnsData = await addOnsRes.json();
        
        if (plansData.success) {
          setPlans(plansData.plans || []);
        }
        if (addOnsData.success) {
          const apiAddOns: AddOnAPI[] = addOnsData.add_ons || [];
          setAddOns(apiAddOns);
          // Initialize qtyByKey for add-ons
          const initialQty: Record<string, string> = {};
          apiAddOns.forEach((ao: AddOnAPI) => {
            initialQty[getAddonKey(ao.name)] = '';
          });
          setQtyByKey(initialQty);
          // Restore cart from localStorage (only keys that match current add-ons)
          try {
            const stored = typeof window !== 'undefined' ? localStorage.getItem(CART_STORAGE_KEY) : null;
            if (stored) {
              const parsed = JSON.parse(stored) as Record<string, number>;
              const validKeys = new Set(apiAddOns.map((a) => getAddonKey(a.name)));
              const restored: Record<string, number> = {};
              Object.entries(parsed).forEach(([k, v]) => {
                if (validKeys.has(k) && Number.isInteger(v) && v > 0) restored[k] = v;
              });
              if (Object.keys(restored).length > 0) setCart(restored);
            }
          } catch (_) {
            // ignore invalid stored cart
          }
        }
      } catch (err) {
        console.error('Failed to fetch plans/add-ons:', err);
      } finally {
        setLoadingPlans(false);
      }
    })();
  }, []);

  // Persist cart to localStorage whenever it changes
  React.useEffect(() => {
    if (typeof window === 'undefined' || Object.keys(cart).length === 0) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (_) {}
  }, [cart]);

  // Phase 7: Fetch subscription amount preview for each plan (selected cycle + coupon)
  React.useEffect(() => {
    if (!companyId || !plans.length) {
      setPreviewByPlan({});
      return;
    }
    const planKeys = ['starter', 'growth', 'enterprise'] as const;
    let cancelled = false;
    setPreviewLoading(true);
    (async () => {
      const cycle = selectedBillingCycle === 'yearly' ? 'yearly' : 'monthly';
      const results: Record<string, SubscriptionPreview | null> = {};
      await Promise.all(
        planKeys.map(async (planKey) => {
          if (cancelled) return;
          try {
            const res = await fetch('/api/billing/calculate-amount', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                plan: planKey,
                billing_cycle: cycle,
                ...(subscriptionCouponCode.trim() ? { coupon_code: subscriptionCouponCode.trim() } : {}),
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (cancelled) return;
            if (data.success && data.finalAmount != null) {
              results[planKey] = {
                finalAmount: data.finalAmount,
                basePrice: data.basePrice,
                discountAmount: data.discountAmount ?? 0,
                couponDiscountAmount: data.couponDiscountAmount ?? 0,
                taxAmount: data.taxAmount ?? 0,
                hasGST: data.hasGST ?? false,
                breakdown: data.breakdown ?? {},
              };
            } else {
              results[planKey] = null;
            }
          } catch {
            if (!cancelled) results[planKey] = null;
          }
        })
      );
      if (!cancelled) setPreviewByPlan(results);
      setPreviewLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, plans.length, selectedBillingCycle, subscriptionCouponCode]);

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
          .select("id, subscription_status, trial_start_date, trial_end_date, trial_activated_at, discount_type, discount_value, discount_applies_to")
          .eq("user_id", user.id)
          .maybeSingle();
        
        // Fetch company discount if company exists
        let discountData = null;
        if (company?.id) {
          try {
            const discountRes = await fetch(`/api/admin/companies/discount?company_id=${company.id}`);
            if (discountRes.ok) {
              const discountBody = await discountRes.json();
              if (discountBody.success && discountBody.discount) {
                discountData = discountBody.discount;
              }
            }
          } catch (err) {
            console.error('Failed to fetch company discount:', err);
          }
        }

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
          setCompanyDiscount(discountData);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- START FREE TRIAL (NO PAYMENT) ---------- */
  async function startFreeTrial() {
    setTrialMessage(null);

    // Check if user needs to set up company first
    if (!companyId) {
      setTrialMessage('Please complete company setup first.');
      router.push('/dashboard/company-setup');
      return;
    }

    // If trial or subscription already exists, send to billing
    if (company?.subscription_status) {
      setTrialMessage('Trial or subscription already active.');
      router.push('/dashboard/billing');
      return;
    }

    setTrialMessage('Activating your free trial...');

    try {
      // Activate trial WITHOUT payment
      const activateRes = await fetch('/api/trial/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
        }),
      });

      const activateBody = await activateRes.json();

      if (activateRes.ok) {
        setTrialMessage('Free trial activated! Redirecting...');
        
        // Refresh auth session
        await supabaseClient().auth.refreshSession();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Redirect to dashboard
        router.push('/dashboard');
      } else {
        setTrialMessage(activateBody?.error || 'Failed to activate trial. Please try again.');
        console.error('Trial activation error:', activateBody);
      }
    } catch (err) {
      setTrialMessage('Failed to activate trial. Please try again.');
      console.error('Activation error:', err);
    }
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

    // Send selected billing cycle so backend uses correct Razorpay plan (monthly vs annual)
    const billingCycle = plan.billing_cycle === 'yearly' ? 'yearly' : 'monthly';

    setTrialMessage('Processing subscription...');
    
    try {
      // Create/upgrade subscription via API (with explicit billing cycle)
      const res = await fetch('/api/billing/subscription/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: normalizedPlan,
          billing_cycle: billingCycle,
          ...(subscriptionCouponCode.trim() ? { coupon_code: subscriptionCouponCode.trim() } : {}),
        }),
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
        const addon = addOns.find((a) => getAddonKey(a.name) === key);
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

  // Phase 7: Fetch cart amount preview (subtotal, coupon, amount to pay)
  React.useEffect(() => {
    if (!companyId || cartItems.length === 0) {
      setCartPreview(null);
      return;
    }
    let cancelled = false;
    setCartPreviewLoading(true);
    const itemsForApi = cartItems
      .map((i) => {
        const key = getAddonKey(i.addon.name);
        const kind = addonKeyToApiKind(key);
        return kind ? { kind, qty: i.qty } : null;
      })
      .filter(Boolean) as Array<{ kind: 'unit' | 'box' | 'carton' | 'pallet' | 'userid'; qty: number }>;
    if (itemsForApi.length === 0) {
      setCartPreview(null);
      setCartPreviewLoading(false);
      return;
    }
    fetch('/api/billing/calculate-cart-amount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        items: itemsForApi,
        ...(cartCouponCode.trim() ? { coupon_code: cartCouponCode.trim() } : {}),
      }),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setCartPreview({
            subtotalInr: data.subtotalInr ?? 0,
            couponDiscountInr: data.couponDiscountInr ?? 0,
            orderAmountInr: data.orderAmountInr ?? 0,
            hasCoupon: data.hasCoupon ?? false,
          });
        } else {
          setCartPreview(null);
        }
      })
      .catch(() => {
        if (!cancelled) setCartPreview(null);
      })
      .finally(() => {
        if (!cancelled) setCartPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, cartItems, cartCouponCode]);

  function addToCart(addon: AddOnAPI, qty: number) {
    setCheckoutMessage(null);
    if (!Number.isInteger(qty) || qty <= 0) {
      setCheckoutMessage(`Invalid quantity: ${qty}. Please enter a positive number.`);
      return;
    }
    const key = getAddonKey(addon.name);
    setCart((prev) => ({ ...prev, [key]: qty }));
    setTimeout(() => {
      setQtyByKey((prev) => ({ ...prev, [key]: '' }));
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
    try {
      if (typeof window !== 'undefined') localStorage.removeItem(CART_STORAGE_KEY);
    } catch (_) {}
  }

  async function checkoutCart() {
    setCheckoutMessage(null);

    // Ensure addOns are loaded before checkout
    if (!addOns || addOns.length === 0) {
      setCheckoutMessage("Loading add-ons. Please wait a moment and try again.");
      return;
    }

    // Check if cart has items
    if (!cart || Object.keys(cart).length === 0) {
      setCheckoutMessage("Cart is empty. Please add items to cart first.");
      return;
    }

    const currentCartItems = Object.entries(cart)
      .map(([key, qty]) => {
        const addon = addOns.find((a) => getAddonKey(a.name) === key);
        if (!addon) return null;
        const quantity = Number(qty);
        if (!Number.isInteger(quantity) || quantity <= 0) return null;
        return { addon, qty: quantity };
      })
      .filter(Boolean) as Array<{ addon: AddOnAPI; qty: number }>;

    if (currentCartItems.length === 0) {
      setCheckoutMessage("Cart items could not be processed. Please remove and re-add items.");
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
      // Map cart keys to API kinds (API expects: unit | box | carton | pallet | userid)
      const itemsForApi = currentCartItems
        .map((i) => {
          const key = getAddonKey(i.addon.name);
          const kind = addonKeyToApiKind(key);
          return kind ? { kind, qty: i.qty } : null;
        })
        .filter(Boolean) as Array<{ kind: "unit" | "box" | "carton" | "pallet" | "userid"; qty: number }>;

      if (itemsForApi.length === 0) {
        setCheckoutMessage("Cart items could not be mapped to products. Please remove and re-add items.");
        return;
      }

      const res = await fetch("/api/addons/cart/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          company_id: companyId,
          items: itemsForApi,
          ...(cartCouponCode.trim() ? { coupon_code: cartCouponCode.trim() } : {}),
        }),
      });

      const body = await res.json().catch(() => ({}));
      const order = body?.order ?? body;
      const keyId = body?.keyId ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      if (!res.ok || !order?.id) {
        const msg =
          res.status === 401
            ? "Please sign in again and try checkout."
            : res.status === 403
              ? "You don't have access to create this order."
              : body?.error || order?.error || "Failed to create cart order.";
        setCheckoutMessage(msg);
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
              credentials: "include",
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
        <div className="max-w-7xl mx-auto px-6 py-12 md:py-14 text-center">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Simple pricing. Full access.
          </h1>
          <p className="mt-2 text-blue-100 text-sm md:text-base">
            GS1-compliant • Unlimited handsets • ERP-agnostic
          </p>
        </div>
      </section>


      {trialMessage && (
        <div className="max-w-7xl mx-auto px-6 pb-2">
          <div className={`rounded-lg p-3 text-sm border ${
            trialMessage.includes('activated') || trialMessage.includes('success')
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
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
          <>
            {/* Billing cycle + coupon row */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Billing</span>
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50/80 p-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedBillingCycle('monthly')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                      selectedBillingCycle === 'monthly'
                        ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBillingCycle('yearly')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                      selectedBillingCycle === 'yearly'
                        ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    Annual
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="subscription-coupon" className="text-xs text-slate-500 whitespace-nowrap">
                  Coupon (optional)
                </label>
                <input
                  id="subscription-coupon"
                  type="text"
                  placeholder="e.g. SAVE10"
                  value={subscriptionCouponCode}
                  onChange={(e) => setSubscriptionCouponCode(e.target.value)}
                  className="border border-slate-200 rounded px-2.5 py-1.5 text-xs w-28 max-w-full bg-white"
                />
              </div>
            </div>

            {/* Compact trial CTA - not a big button */}
            {trialEligible && (
              <div className="mb-6 text-center">
                <span className="text-slate-600 text-sm">New here? </span>
                <button
                  type="button"
                  onClick={startFreeTrial}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Start 15-day free trial
                </button>
                <span className="text-slate-500 text-sm"> (no card required)</span>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-8">
              {(() => {
                // Group by plan name: monthly and yearly are separate subscription options
                const byName: Record<string, { monthly?: Plan; yearly?: Plan }> = {};
                for (const p of plans) {
                  if (!byName[p.name]) byName[p.name] = {};
                  if (p.billing_cycle === 'monthly') byName[p.name].monthly = p;
                  if (p.billing_cycle === 'yearly') byName[p.name].yearly = p;
                }
                const planGroups = Object.entries(byName).map(([name, group]) => ({ name, ...group }));

                return planGroups.map(({ name, monthly, yearly }) => {
                  // Plan for selected cycle (monthly or annual) - used for price display and Subscribe
                  const planForCycle = selectedBillingCycle === 'monthly' ? (monthly ?? yearly) : (yearly ?? monthly);
                  if (!planForCycle) return null;

                  const monthlyDiscount = monthly ? calculateDiscountedPrice(monthly.base_price, companyDiscount) : null;
                  const yearlyDiscount = yearly ? calculateDiscountedPrice(yearly.base_price, companyDiscount) : null;

                  const isMonthly = selectedBillingCycle === 'monthly';
                  const discount = isMonthly ? monthlyDiscount : yearlyDiscount;
                  const basePrice = planForCycle.base_price;

                  let price: string | React.ReactNode = isMonthly
                    ? `₹${basePrice.toLocaleString('en-IN')} / month`
                    : `₹${basePrice.toLocaleString('en-IN')} / year`;
                  if (discount?.hasDiscount) {
                    price = (
                      <span>
                        <span className="line-through text-gray-500 mr-2">
                          ₹{basePrice.toLocaleString('en-IN')}
                        </span>
                        <span className="text-green-600 font-bold">
                          ₹{discount.discountedPrice.toLocaleString('en-IN')}
                        </span>
                        <span className="text-gray-600"> {isMonthly ? '/ month' : '/ year'}</span>
                      </span>
                    );
                  }

                  // Show other cycle as secondary (e.g. "or ₹X/year")
                  const otherCycleLabel = isMonthly && yearly
                    ? `or ₹${(yearlyDiscount?.discountedPrice ?? yearly.base_price).toLocaleString('en-IN')} / year`
                    : !isMonthly && monthly
                    ? `or ₹${(monthlyDiscount?.discountedPrice ?? monthly.base_price).toLocaleString('en-IN')} / month`
                    : '';

                  const savings = yearly && monthly && selectedBillingCycle === 'yearly'
                    ? `Save ₹${((monthly.base_price * 12) - yearly.base_price).toLocaleString('en-IN')} vs monthly`
                    : yearly && monthly && selectedBillingCycle === 'monthly'
                    ? `Switch to annual to save ₹${((monthly.base_price * 12) - yearly.base_price).toLocaleString('en-IN')} / year`
                    : '';

                  const items = planForCycle.items.map(item =>
                    item.value ? `${item.label}: ${item.value}` : item.label
                  );

                  const cycleLabel = planForCycle.billing_cycle === 'yearly' ? 'Annual' : 'Monthly';
                  const actionLabel = `Subscribe to ${name} (${cycleLabel})`;
                  const planKey = name.toLowerCase().replace(/\s+/g, '_');
                  const previewKey = planKey === 'starter' ? 'starter' : planKey === 'growth' ? 'growth' : planKey === 'enterprise' ? 'enterprise' : planKey;
                  const preview = companyId && previewByPlan[previewKey];

                  return (
                    <PlanCard
                      key={name}
                      title={name}
                      price={price}
                      yearly={otherCycleLabel}
                      savings={savings}
                      items={items}
                      highlight={name.toLowerCase().includes('growth') || name.toLowerCase().includes('popular')}
                      actionLabel={actionLabel}
                      onAction={() => subscribeToPlan(planForCycle)}
                      disabled={false}
                      disabledReason={null}
                      youPayPreview={preview ? { finalAmount: preview.finalAmount, isMonthly: isMonthly, breakdown: preview.breakdown, hasGST: preview.hasGST } : undefined}
                      previewLoading={previewLoading}
                    />
                  );
                });
              })()}
            </div>
          </>
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
                <p className="text-slate-700">Full access to all plan features for 15 days. No payment required.</p>
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
                const key = getAddonKey(addon.name);
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
                {checkoutLoading ? "Processing…" : Object.keys(cart).length === 0 ? "Add items to cart" : `Checkout (${cartPreview ? `₹${cartPreview.orderAmountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : formatINRFromPaise(cartTotalPaise)})`}
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
                    const key = getAddonKey(item.addon.name);
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
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <label htmlFor="cart-coupon" className="text-sm text-slate-600 whitespace-nowrap">
                    Coupon code (optional):
                  </label>
                  <input
                    id="cart-coupon"
                    type="text"
                    placeholder="e.g. SAVE10"
                    value={cartCouponCode}
                    onChange={(e) => setCartCouponCode(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-32 max-w-full"
                  />
                </div>
                <div className="flex flex-col items-end gap-1">
                  {cartPreviewLoading && (
                    <span className="text-xs text-slate-500">Calculating…</span>
                  )}
                  {!cartPreviewLoading && cartPreview && (
                    <div className="text-right text-sm text-slate-600">
                      {cartPreview.hasCoupon && (
                        <>
                          <span>Subtotal: ₹{cartPreview.subtotalInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          <br />
                          <span>Coupon: -₹{cartPreview.couponDiscountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          <br />
                        </>
                      )}
                      <span className="font-semibold text-slate-800">You pay: ₹{cartPreview.orderAmountInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {!cartPreview && !cartPreviewLoading && (
                    <>
                      <span className="text-sm text-slate-600">Grand total</span>
                      <span className="text-lg font-bold text-slate-900">{formatINRFromPaise(cartTotalPaise)}</span>
                    </>
                  )}
                </div>
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
              <li>• 15-day free trial requires no payment or credit card.</li>
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
  youPayPreview,
  previewLoading = false,
}: {
  title: string;
  price: string | React.ReactNode;
  yearly: string | React.ReactNode;
  items: string[];
  savings: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
  highlight?: boolean;
  youPayPreview?: { finalAmount: number; isMonthly: boolean; breakdown: { base?: number; discount?: number; coupon?: number; subtotalAfterCoupon?: number; tax?: number; total?: number }; hasGST: boolean };
  previewLoading?: boolean;
}) {
  const hasBreakdown = youPayPreview?.breakdown && (Number(youPayPreview.breakdown.discount ?? 0) > 0 || Number(youPayPreview.breakdown.coupon ?? 0) > 0 || Number(youPayPreview.breakdown.tax ?? 0) > 0);
  return (
    <div
      className={`rounded-2xl p-8 border ${
        highlight
          ? "border-blue-600 bg-white"
          : "border-slate-200 bg-white"
      }`}
    >
      <h3 className="text-2xl font-bold">{title}</h3>
      <div className="mt-4 text-3xl font-bold">{price}</div>
      <div className="text-slate-600">{yearly}</div>

      <ul className="mt-6 space-y-2 text-slate-600">
        {items.map((item) => (
          <li key={item}>✔ {item}</li>
        ))}
      </ul>

      <div className="mt-6 text-sm text-emerald-700 font-semibold">
        {savings}
      </div>

      {/* Phase 7: You pay (incl. discount & tax) - matches Razorpay and invoice */}
      {previewLoading && (
        <div className="mt-4 text-sm text-slate-500">Calculating final amount…</div>
      )}
      {!previewLoading && youPayPreview && (
        <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="text-sm font-semibold text-slate-800">
            You pay: ₹{youPayPreview.finalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {youPayPreview.isMonthly ? ' / month' : ' / year'}
          </div>
          {hasBreakdown && youPayPreview.breakdown && (
            <ul className="mt-2 text-xs text-slate-600 space-y-0.5">
              {youPayPreview.breakdown.base != null && <li>Base: ₹{Number(youPayPreview.breakdown.base).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>}
              {Number(youPayPreview.breakdown.discount ?? 0) > 0 && <li>Discount: -₹{Number(youPayPreview.breakdown.discount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>}
              {Number(youPayPreview.breakdown.coupon ?? 0) > 0 && <li>Coupon: -₹{Number(youPayPreview.breakdown.coupon).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>}
              {Number(youPayPreview.breakdown.tax ?? 0) > 0 && youPayPreview.hasGST && <li>GST (18%): +₹{Number(youPayPreview.breakdown.tax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>}
              <li className="font-medium text-slate-800">Total: ₹{Number(youPayPreview.breakdown.total ?? youPayPreview.finalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</li>
            </ul>
          )}
        </div>
      )}

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
