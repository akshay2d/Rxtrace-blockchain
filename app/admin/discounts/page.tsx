'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminDiscountsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0052CC]">Discounts</h1>
        <p className="mt-1 text-sm text-gray-600">Discount and coupon management is deferred to a later billing phase.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Module Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Billing module under refactor.</p>
        </CardContent>
      </Card>
    </div>
  );
}
