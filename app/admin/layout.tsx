// app/admin/layout.tsx - Super Admin Layout
'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield, LogOut, Building2, Users, Activity, Database, BarChart, TrendingUp, Tag } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { supabaseClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [adminEmail, setAdminEmail] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabaseClient().auth.getUser();
      if (user) {
        setAdminEmail(user.email || '');
        // Admin role check: Only authenticated users can access
        // For super-admin features, add additional role verification in specific pages
        // In production, check if user has admin role
      } else {
        router.push('/auth/signin?redirect=/admin');
      }
    }
    checkAdmin();
  }, [router]);

  const handleSignOut = async () => {
    await supabaseClient().auth.signOut();
    router.push('/auth/signin?redirect=/admin');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-purple-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-lg">
        <Link href="/" className="p-6 border-b bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 transition">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="RxTrace" width={32} height={32} className="bg-white rounded-md p-1" />
            <div>
              <span className="text-xl font-bold text-white block">Super Admin</span>
              <span className="text-xs text-orange-100">RxTrace India</span>
            </div>
          </div>
        </Link>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            <li>
              <Link href="/admin">
                <Button variant="ghost" className="w-full justify-start gap-3 hover:bg-orange-50">
                  <BarChart className="h-5 w-5" /> Dashboard
                </Button>
              </Link>
            </li>
            <li>
              <Link href="/admin/analytics">
                <Button variant="ghost" className="w-full justify-start gap-3 hover:bg-orange-50">
                  <TrendingUp className="h-5 w-5" /> Analytics
                </Button>
              </Link>
            </li>
            <li>
              <Link href="/admin/companies">
                <Button variant="ghost" className="w-full justify-start gap-3 hover:bg-orange-50">
                  <Building2 className="h-5 w-5" /> Companies
                </Button>
              </Link>
            </li>
            <li>
              <Link href="/admin/users">
                <Button variant="ghost" className="w-full justify-start gap-3 hover:bg-orange-50">
                  <Users className="h-5 w-5" /> Users
                </Button>
              </Link>
            </li>
            <li>
              <Link href="/admin/scans">
                <Button variant="ghost" className="w-full justify-start gap-3 hover:bg-orange-50">
                  <Activity className="h-5 w-5" /> Scan Logs
                </Button>
              </Link>
            </li>
            <li>
              <Link href="/admin/subscriptions">
                <Button variant="ghost" className="w-full justify-start gap-3 hover:bg-orange-50">
                  <Shield className="h-5 w-5" /> Subscriptions
                </Button>
              </Link>
            </li>
            <li>
              <Link href="/admin/add-ons">
                <Button variant="ghost" className="w-full justify-start gap-3 hover:bg-orange-50">
                  <Shield className="h-5 w-5" /> Add-ons
                </Button>
              </Link>
            </li>
            <li>
              <Link href="/admin/discounts">
                <Button variant="ghost" className="w-full justify-start gap-3 hover:bg-orange-50">
                  <Tag className="h-5 w-5" /> Discounts & Coupons
                </Button>
              </Link>
            </li>
            <li>
              <Link href="/admin/billing">
                <Button variant="ghost" className="w-full justify-start gap-3 hover:bg-orange-50">
                  <BarChart className="h-5 w-5" /> Billing
                </Button>
              </Link>
            </li>

            <li>
              <Link href="/admin/demo-requests">
                <Button variant="ghost" className="w-full justify-start gap-3 hover:bg-orange-50">
                  <Activity className="h-5 w-5" /> Demo Requests
                </Button>
              </Link>
            </li>
            <li>
              <Link href="/dashboard">
                <Button variant="outline" className="w-full justify-start gap-3 mt-4 border-blue-500 text-blue-600 hover:bg-blue-50">
                  <Database className="h-5 w-5" /> User Dashboard →
                </Button>
              </Link>
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t">
          <Card className="p-4 bg-gradient-to-br from-orange-50 to-red-50">
            <p className="text-xs font-medium text-gray-600">Logged in as:</p>
            <p className="text-sm text-gray-800 truncate font-semibold">{adminEmail}</p>
            <div className="mt-1 text-xs text-orange-600 font-medium">System Administrator</div>
          </Card>
          <Button onClick={handleSignOut} variant="outline" className="w-full mt-4 gap-2 border-red-300 text-red-600 hover:bg-red-50">
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-auto">
        {children}
      </div>
    </div>
  );
}
