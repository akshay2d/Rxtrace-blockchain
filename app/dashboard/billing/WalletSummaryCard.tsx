'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Props = {
  balance: number;
  creditLimit: number;
  status: string;
  companyName: string;
};

export default function WalletSummaryCard({
  balance,
  creditLimit,
  status,
  companyName,
}: Props) {
  return (
    <Card className="border-l-4 border-l-orange-500">
      <CardContent className="p-6 space-y-2">
        <div className="text-sm text-gray-500">{companyName}</div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs text-gray-500">Wallet Balance</div>
            <div className="text-2xl font-bold">₹ {balance.toLocaleString()}</div>
          </div>

          <div>
            <div className="text-xs text-gray-500">Credit Limit</div>
            <div className="text-2xl font-bold">₹ {creditLimit.toLocaleString()}</div>
          </div>
        </div>

        <div>
          <Badge variant={status === 'ACTIVE' ? 'default' : 'destructive'}>
            {status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
