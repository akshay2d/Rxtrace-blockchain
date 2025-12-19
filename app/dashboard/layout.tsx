'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Pill,
  LogOut,
  QrCode,
  BarChart3,
  Home,
  History,
  Shield,
  Package
} from 'lucide-react';
import Link from 'next/link';
import { supabaseClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [userEmail, setUserEmail] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabaseClient().auth.getUser();
      if (user) {
        setUserEmail(user.email || '');

        const pendingData = localStorage.getItem('pending_company_data');
        if (pendingData) {
          try {
            const companyData = JSON.parse(pendingData);
            const { error } = await supabaseClient()
              .from('companies')
              .insert(companyData);

            if (!error) {
              localStorage.removeItem('pending_company_data');
            }
          } catch (err) {
            console.error('Error saving pending company data:', err);
          }
        }
      }
    }
    getUser();
  }, []);

  const handleSignOut = async () => {
    await supabaseClient().auth.signOut();
    router.push('/auth/signin');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            <Pill className="h-8 w-8 text-orange-500" />
            <span className="text-xl font-bold text-[#0052CC]">
              RxTrace India
            </span>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            <li>
              <Link href="/dashboard">
                <Button variant="ghost" className="w-full justify-start gap-3">
                  <Home className="h-5 w-5" /> Overview
                </Button>
              </Link>
            </li>

            <li>
              <Link href="/dashboard/generate">
                <Button variant="ghost" className="w-full justify-start gap-3">
                  <QrCode className="h-5 w-5" /> Generate Labels
                </Button>
              </Link>
            </li>

            <li>
              <Link href="/dashboard/history">
                <Button variant="ghost" className="w-full justify-start gap-3">
                  <History className="h-5 w-5" /> Label History
                </Button>
              </Link>
            </li>

            <li>
              <Link href="/dashboard/analytics">
                <Button variant="ghost" className="w-full justify-start gap-3">
                  <BarChart3 className="h-5 w-5" /> Analytics & Billing
                </Button>
              </Link>
            </li>

            <li>
              <Link href="/dashboard/packing-rules">
                <Button variant="ghost" className="w-full justify-start gap-3">
                  <QrCode className="h-5 w-5" /> Packing Rules
                </Button>
              </Link>
            </li>

            <li>
              <Link href="/dashboard/products">
                <Button variant="ghost" className="w-full justify-start gap-3">
                  <Package className="h-5 w-5" /> SKU Master
                </Button>
              </Link>
            </li>

            {/* ✅ PHASE 4.1 — Handsets */}
            <li>
              <Link href="/dashboard/admin/handsets">
                <Button variant="ghost" className="w-full justify-start gap-3">
                  <Shield className="h-5 w-5" /> Handsets
                </Button>
              </Link>
            </li>

            <li>
              <Link href="/dashboard/billing">
                <Button variant="ghost" className="w-full justify-start gap-3">
                  <BarChart3 className="h-5 w-5" /> Billing
                </Button>
              </Link>
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t">
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-orange-50">
            <p className="text-sm font-medium">Logged in as:</p>
            <p className="text-sm text-gray-700 truncate">{userEmail}</p>
          </Card>

          <Button
            onClick={handleSignOut}
            variant="outline"
            className="w-full mt-4 gap-2"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">{children}</div>
    </div>
  );
}
