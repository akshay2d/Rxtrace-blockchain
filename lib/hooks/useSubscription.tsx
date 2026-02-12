'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabaseClient } from '@/lib/supabase/client';

type SubscriptionStatus = 'TRIAL' | 'trialing' | 'EXPIRED' | null;

type Subscription = {
  id: string;
  company_id: string;
  status: SubscriptionStatus;
  trial_end: string | null;
};

type SubscriptionData = {
  subscription: Subscription | null;
  add_ons: any[];
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = async () => {
    try {
      setError(null);
      const supabase = supabaseClient();
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setSubscription(null);
        return;
      }

      const { data: company } = await supabase
        .from('companies')
        .select('id, trial_status, trial_ends_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!company) {
        setSubscription(null);
        return;
      }

      const active = company.trial_status === 'active' && !!company.trial_ends_at && new Date(company.trial_ends_at) > new Date();
      setSubscription(active ? {
        id: `trial-${company.id}`,
        company_id: company.id,
        status: 'trialing',
        trial_end: company.trial_ends_at,
      } : {
        id: `trial-${company.id}`,
        company_id: company.id,
        status: 'EXPIRED',
        trial_end: company.trial_ends_at,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
  }, []);

  const isFeatureEnabled = () => !!subscription && (subscription.status === 'TRIAL' || subscription.status === 'trialing');
  const canAccess = () => isFeatureEnabled();

  return (
    <SubscriptionContext.Provider value={{ subscription, add_ons: [], discounts: [], loading, error, refresh: fetchSubscription, isFeatureEnabled, canAccess }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used within SubscriptionProvider');
  return context;
}
