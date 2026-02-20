'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

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
      const res = await fetch('/api/trial/status', { credentials: 'include' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `Failed to load trial status (${res.status})`);
      }
      const payload = await res.json();
      setSubscription(payload.subscription ?? null);
    } catch (err: any) {
      setSubscription(null);
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
