'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CompanyAuditPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/companies')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Companies
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Audit</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          Billing module under refactor.
        </CardContent>
      </Card>
    </div>
  );
}
