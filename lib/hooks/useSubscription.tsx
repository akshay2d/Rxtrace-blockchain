'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase/client';

type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED' | null;

type Subscription = {
  id: string;
  company_id: string;
  plan_id: string;
  plan: {
    id: string;
    name: string;
    description: string | null;
    billing_cycle: string;
    base_price: number;
  };
  status: SubscriptionStatus;
  trial_end: string | null;
  current_period_end: string | null;
  razorpay_subscription_id: string | null;
};

type AddOn = {
  id: string;
  add_on_id: string;
  quantity: number;
  status: string;
  add_ons: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    unit: string;
    recurring: boolean;
  };
};

type SubscriptionData = {
  subscription: Subscription | null;
  add_ons: AddOn[];
  discounts: any[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isFeatureEnabled: (feature: string) => boolean;
  canAccess: () => boolean;
};

const SubscriptionContext = createContext<SubscriptionData | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchSubscription = async () => {
    try {
      setError(null);
      const res = await fetch('/api/user/subscription', { cache: 'no-store' });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch subscription');
      }

      setSubscription(data.subscription || null);
      setAddOns(data.add_ons || []);
      setDiscounts(data.discounts || []);

      // Check if company access is disabled (FROZEN status)
      if (data.subscription) {
        // Check company wallet status for freeze
        const supabase = supabaseClient();
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('id', data.subscription.company_id)
          .maybeSingle();

        if (company) {
          const { data: wallet } = await supabase
            .from('company_wallets')
            .select('status')
            .eq('company_id', company.id)
            .maybeSingle();

          if (wallet?.status === 'FROZEN') {
            // Force logout
            await supabase.auth.signOut();
            router.push('/auth/signin?message=Account access has been disabled. Please contact support.');
            return;
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Subscription fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchSubscription, 30000);
    return () => clearInterval(interval);
  }, []);

  const isFeatureEnabled = (feature: string): boolean => {
    // Allow code generation without subscription (pre-Phase 1 behavior)
    if (feature === 'code_generation') {
      // If no subscription, allow access (legacy behavior - code generation was always available)
      if (!subscription) return true;
      
      // If subscription exists, check status
      const status = subscription.status;
      if (status === 'PAUSED' || status === 'CANCELLED' || status === 'EXPIRED') {
        return false;
      }
      return status === 'TRIAL' || status === 'ACTIVE';
    }
    
    // For other features, require subscription
    if (!subscription) return false;
    
    const status = subscription.status;
    if (status === 'PAUSED' || status === 'CANCELLED' || status === 'EXPIRED') {
      return false;
    }

    // Feature checks can be extended based on plan_items
    // For now, basic status check
    return status === 'TRIAL' || status === 'ACTIVE';
  };

  const canAccess = (): boolean => {
    if (!subscription) return false;
    const status = subscription.status;
    return status === 'TRIAL' || status === 'ACTIVE';
  };

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        add_ons: addOns,
        discounts,
        loading,
        error,
        refresh: fetchSubscription,
        isFeatureEnabled,
        canAccess,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
}
