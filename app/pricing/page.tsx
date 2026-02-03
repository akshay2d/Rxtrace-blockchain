"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { loadRazorpay } from "@/lib/razorpay";
import { supabaseClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

/* ===================== TYPES ===================== */

/* Add-on prices come from /api/public/add-ons (admin source of truth). No frontend constants. */

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
  const [subscriptionMessage, setSubscriptionMessage] = React.useState<string | null>(null);
  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [addOns, setAddOns] = React.useState<AddOnAPI[]>([]);
  const [loadingPlans, setLoadingPlans] = React.useState(true);
  const [companyDiscount, setCompanyDiscount] = React.useState<{
    discount_type: 'percentage' | 'flat' | null;
    discount_value: number | null;
    discount_applies_to: 'subscription' | 'addon' | 'both' | null;
  } | null>(null);
  const [companyLoadError, setCompanyLoadError] = React.useState<string | null>(null);

  // Coupon codes (admin-created, assigned to company): optional at checkout
  const [subscriptionCouponCode, setSubscriptionCouponCode] = React.useState('');
  const [cartCouponCode, setCartCouponCode] = React.useState('');

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

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseClient();
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) return;

        // Prefer subscription API (uses canonical company resolver: owner + seat)
        let companyIdFromApi: string | null = null;
        let subscriptionStatusFromApi: string | null = null;
        let subscriptionData: any = null;
        try {
          const subRes = await fetch('/api/user/subscription', { cache: 'no-store', credentials: 'include' });
          if (subRes.status === 401) {
            if (!cancelled) router.replace('/auth/signin?redirect=/pricing');
            return;
          }
          if (subRes.ok) {
            const subBody = await subRes.json();
            companyIdFromApi = subBody.company_id ?? null;
            subscriptionStatusFromApi = subBody.subscription_status ?? null;
            subscriptionData = subBody.subscription ?? null;
          }
        } catch (subErr) {
          console.error('[Pricing] Failed to fetch subscription:', subErr);
        }

        // If API returned company_id, use it (resolver-backed; works for owner and seat)
        if (companyIdFromApi) {
          let discountData = null;
          try {
            const discountRes = await fetch(`/api/admin/companies/discount?company_id=${companyIdFromApi}`);
            if (discountRes.ok) {
              const discountBody = await discountRes.json();
              if (discountBody.success && discountBody.discount) discountData = discountBody.discount;
            }
          } catch (err) {
            console.error('Failed to fetch company discount:', err);
          }
          if (!cancelled) {
            setCompany({
              id: companyIdFromApi,
              subscription_status: subscriptionStatusFromApi,
            });
            setCompanyId(companyIdFromApi);
            setSubscription(subscriptionData);
            setCompanyDiscount(discountData);
            setCompanyLoadError(null);
          }
          return;
        }

        // Fallback: direct company fetch (owner only; correct column names)
        const { data: company } = await supabase
          .from("companies")
          .select("id, subscription_status, discount_type, discount_value, discount_applies_to")
          .eq("user_id", user.id)
          .maybeSingle();

        let discountData = null;
        if (company?.id) {
          try {
            const discountRes = await fetch(`/api/admin/companies/discount?company_id=${company.id}`);
            if (discountRes.ok) {
              const discountBody = await discountRes.json();
              if (discountBody.success && discountBody.discount) discountData = discountBody.discount;
            }
          } catch (err) {
            console.error('Failed to fetch company discount:', err);
          }
        }

        if (!cancelled) {
          setCompany(company ?? null);
          setCompanyId((company as any)?.id ?? null);
          setSubscription(subscriptionData);
          setCompanyDiscount(discountData);
          setCompanyLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[Pricing] Failed to load company:', err);
          setCompanyLoadError('Could not load company. If you\'ve completed setup, go to Dashboard first, then return here to subscribe.');
          setCompanyId(null);
          setCompany(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- SUBSCRIBE TO PLAN (PAYMENT ONLY) ---------- */
  async function subscribeToPlan(plan: Plan) {
    setSubscriptionMessage(null);
    setCheckoutMessage(null);

    const ok = await loadRazorpay();
    if (!ok) {
      setSubscriptionMessage('Razorpay failed to load. Please refresh and try again.');
      return;
    }

    // Normalize plan tier (starter, growth, enterprise) for Razorpay; pass billing_cycle as-is
    const planKey = plan.name.toLowerCase().replace(/\s+/g, '_');
    const normalizedPlan = planKey.includes('starter') ? 'starter' : 
                           planKey.includes('growth') ? 'growth' : 
                           planKey.includes('enterprise') ? 'enterprise' : 'starter';

    const billingCycle = plan.billing_cycle;

    setSubscriptionMessage('Processing subscription...');

    try {
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
      if (res.status === 401) {
        router.replace('/auth/signin?redirect=/pricing');
        return;
      }
      if (!res.ok) {
        const detail = body?.details ? ` (${body.details})` : '';
        setSubscriptionMessage((body?.error || 'Failed to create subscription. Please try again.') + detail);
        console.error('Subscription upgrade error:', body);
        return;
      }

      if (!body.subscription || !body.subscription.id) {
        setSubscriptionMessage('Subscription created but payment link not available. Please contact support.');
        return;
      }

      const subscriptionData = body.subscription;
      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      if (!keyId) {
        setSubscriptionMessage('Razorpay key not configured. Please contact support.');
        return;
      }

      setSubscriptionMessage(null);

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
              setSubscriptionMessage('Payment successful! Updating subscription...');
              // Refresh session and redirect to billing
              await supabaseClient().auth.refreshSession();
              await new Promise(resolve => setTimeout(resolve, 1000));
              router.push('/dashboard/billing');
            } catch (err) {
              setSubscriptionMessage('Payment successful. Please refresh the page to see your subscription.');
            }
          },
          modal: {
            ondismiss: () => {
              setSubscriptionMessage('Payment cancelled. You can try again anytime.');
            },
          },
          theme: { color: '#0052CC' },
        }).open();
      } else {
        setSubscriptionMessage('Payment link not available. Please contact support.');
      }
    } catch (err: any) {
      setSubscriptionMessage(err?.message || 'Failed to process subscription. Please try again.');
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


      {companyLoadError && (
        <div className="max-w-7xl mx-auto px-6 pb-2">
          <div className="rounded-lg p-3 text-sm border bg-amber-50 border-amber-200 text-amber-900">
            {companyLoadError}
            <span className="ml-2">
              <Link href="/dashboard" className="font-medium underline">Go to Dashboard</Link>
              <span className="mx-1">·</span>
              <Link href="/dashboard/company-setup" className="font-medium underline">Company setup</Link>
            </span>
          </div>
        </div>
      )}

      {subscriptionMessage && (
        <div className="max-w-7xl mx-auto px-6 pb-2">
          <div className={`rounded-lg p-3 text-sm border ${
            subscriptionMessage.includes('successful') || subscriptionMessage.includes('success')
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {subscriptionMessage}
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
            {/* Coupon row */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
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

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const isMonthly = plan.billing_cycle === 'monthly';
                const isQuarterly = plan.billing_cycle === 'quarterly';
                const periodLabel = isMonthly ? '/ month' : isQuarterly ? '/ quarter' : '/ year';
                const discount = calculateDiscountedPrice(plan.base_price, companyDiscount);
                let price: string | React.ReactNode = `₹${plan.base_price.toLocaleString('en-IN')}${periodLabel}`;
                if (discount?.hasDiscount) {
                  price = (
                    <span>
                      <span className="line-through text-gray-500 mr-1 text-sm">₹{plan.base_price.toLocaleString('en-IN')}</span>
                      <span className="text-green-600 font-semibold">₹{discount.discountedPrice.toLocaleString('en-IN')}</span>
                      <span className="text-gray-600 text-sm">{periodLabel}</span>
                    </span>
                  );
                }
                const items = plan.items.map(item => (item.value ? `${item.label}: ${item.value}` : item.label));
                const cycleLabel = isMonthly ? 'Monthly' : isQuarterly ? 'Quarterly' : 'Annual';

                return (
                  <PlanCard
                    key={`${plan.id}-${plan.billing_cycle}`}
                    title={plan.name}
                    price={price}
                    yearly=""
                    savings=""
                    items={items}
                    highlight={plan.name.toLowerCase().includes('growth') || plan.name.toLowerCase().includes('popular')}
                    actionLabel={`Subscribe (${cycleLabel})`}
                    onAction={() => subscribeToPlan(plan)}
                  />
                );
              })}
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

          {/* All Plan Pricing - 6 fixed plans */}
          <div className="mt-6 p-4 bg-white border border-blue-300 rounded-lg">
            <h3 className="font-bold text-blue-900 mb-3">📋 Complete Plan Pricing</h3>
            <div className="space-y-2 text-sm text-gray-700">
              <div>
                <p className="font-semibold text-blue-800">Starter Monthly: ₹18,000/month</p>
                <p className="font-semibold text-blue-800">Starter Yearly: ₹2,00,000/year</p>
              </div>
              <div>
                <p className="font-semibold text-blue-800">Growth Monthly: ₹49,000/month</p>
                <p className="font-semibold text-blue-800">Growth Yearly: ₹5,00,000/year</p>
              </div>
              <div>
                <p className="font-semibold text-blue-800">Enterprise Monthly: ₹2,00,000/month</p>
                <p className="font-semibold text-blue-800">Enterprise Quarterly: ₹6,00,000/quarter</p>
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
              <li>• Start your 15-day free trial from Settings after company setup.</li>
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
  highlight = false,
}: {
  title: string;
  price: string | React.ReactNode;
  yearly: string | React.ReactNode;
  items: string[];
  savings: string;
  actionLabel: string;
  onAction: () => void;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 border transition ${
        highlight
          ? "border-blue-500 bg-blue-50/50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <div className="mt-2 text-xl font-bold text-slate-800">{price}</div>
      {yearly ? <div className="mt-1 text-xs text-slate-500">{yearly}</div> : null}

      <ul className="mt-3 space-y-1 text-sm text-slate-600">
        {items.slice(0, 4).map((item) => (
          <li key={item} className="flex items-start gap-1">✔ <span>{item}</span></li>
        ))}
      </ul>

      {savings ? <div className="mt-2 text-xs text-emerald-600 font-medium">{savings}</div> : null}

      <button
        onClick={onAction}
        className={`mt-4 w-full py-2 rounded-lg text-sm font-medium transition ${
          highlight
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "border border-slate-300 hover:bg-blue-600 hover:text-white hover:border-blue-600"
        }`}
      >
        {actionLabel}
      </button>
    </div>
  );
}
