// app/dashboard/analytics/page.tsx
import { Card } from '@/components/ui/card';

export default function Analytics() {
  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold text-[#0052CC]">Analytics</h1>
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="p-8 text-center">
          <h3 className="text-5xl font-bold text-orange-500">1,24,680</h3>
          <p className="text-xl mt-2">Total Labels Generated</p>
        </Card>
        <Card className="p-8 text-center">
          <h3 className="text-5xl font-bold text-green-600">8,420</h3>
          <p className="text-xl mt-2">This Month</p>
        </Card>
        <Card className="p-8 text-center">
          <h3 className="text-5xl font-bold text-blue-600">98.7%</h3>
          <p className="text-xl mt-2">Scan Success Rate</p>
        </Card>
      </div>
    </div>
  );
}