'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Subscription cancel is on Billing page. Redirect to avoid duplicate. */
export default function CancelSubscriptionRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/billing');
  }, [router]);
  return (
    <div className="p-6 text-center text-gray-600">
      Redirecting to Billing...
    </div>
  );
}
