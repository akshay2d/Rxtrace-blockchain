'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Subscription upgrade is on Pricing page. Redirect to avoid duplicate. */
export default function UpgradePlanRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/pricing');
  }, [router]);
  return (
    <div className="p-6 text-center text-gray-600">
      Redirecting to Pricing...
    </div>
  );
}
