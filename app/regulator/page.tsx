import { Card } from '@/components/ui/card';

export default function RegulatorHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0052CC]">Regulator Dashboard</h1>
        <p className="text-gray-600 mt-2">Access protected regulator views and reports.</p>
      </div>

      <Card className="p-6">
        <p className="text-sm text-gray-700">
          This area is now integrated into the same Next.js repo and protected by the
          middleware. Next step is to connect the specific regulator features you want
          (e.g., scan analytics, audit trails, export).
        </p>
      </Card>
    </div>
  );
}
