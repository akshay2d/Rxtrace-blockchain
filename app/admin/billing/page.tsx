"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabaseClient } from "@/lib/supabase/client";
import { CreditCard, FileText, RefreshCw, Download } from "lucide-react";

type Subscription = {
  company_id: string;
  company_name: string;
  plan_name: string;
  status: string;
  current_period_end: string;
};

type Invoice = {
  id: string;
  company_id: string;
  company_name: string;
  amount: number;
  status: string;
  created_at: string;
};

export default function AdminBillingPage() {
  const [loading, setLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      
      // Fetch subscriptions (if subscription table exists)
      // Note: This is a placeholder - adjust based on actual schema
      const { data: subsData } = await supabase
        .from('companies')
        .select('id, company_name')
        .limit(50);
      
      // Fetch invoices (if invoice table exists)
      // Note: This is a placeholder - adjust based on actual schema
      
      if (subsData) {
        setSubscriptions(subsData.map(c => ({
          company_id: c.id,
          company_name: c.company_name,
          plan_name: 'N/A',
          status: 'active',
          current_period_end: new Date().toISOString()
        })));
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">💰 Billing Management</h1>
          <p className="text-gray-600 mt-1">Manage Razorpay subscriptions, invoices, and refunds</p>
        </div>
        <Button onClick={fetchData} disabled={loading} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Billing System
          </CardTitle>
          <CardDescription>
            Billing is handled by Razorpay. Subscriptions and add-ons are managed through Razorpay Checkout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Wallet-based credits/top-ups have been removed. All billing is now handled through Razorpay subscriptions and add-on purchases.
              </p>
            </div>
            
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Future Features</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• View Razorpay subscriptions by company</li>
                <li>• Manage subscription pause/resume</li>
                <li>• Process refunds and credit notes</li>
                <li>• Export billing reports</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
