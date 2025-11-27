// app/dashboard/page.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, Download, CheckCircle, Users } from 'lucide-react';
import Link from 'next/link';

export default function DashboardHome() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-[#0052CC] mb-2">Welcome back!</h1>
        <p className="text-xl text-gray-600">Generate GS1-compliant labels in seconds</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Labels This Month</CardTitle>
            <QrCode className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">8,420</div>
            <p className="text-xs text-gray-500">+18% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Total Generated</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">1,24,680</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">47</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Plan Limit</CardTitle>
            <QrCode className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">10,00,000 / month</div>
          </CardContent>
        </Card>
      </div>

      <div className="text-center py-12 bg-gradient-to-r from-blue-50 to-orange-50 rounded-2xl">
        <h2 className="text-3xl font-bold mb-6">Ready to generate labels?</h2>
        <Link href="/dashboard/generate">
          <Button size="lg" className="bg-orange-500 hover:bg-orange-600 text-xl px-12 py-8">
            Generate Labels Now
          </Button>
        </Link>
      </div>
    </div>
  );
}