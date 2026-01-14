"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";

type WalletData = {
  company_id: string;
  balance: number;
  credit_limit: number;
  status: string;
  updated_at: string;
};

type CompanyData = {
  id: string;
  company_name: string;
};

export default function AdminBillingPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Wallet system removed: Razorpay subscription + add-on payments are the source of truth.
      setMessage(null);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">System Billing Management</h1>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">System Billing Management</h1>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-2">Wallet removed</h2>
        <p className="text-sm text-gray-600">
          Credits/top-ups are disabled. Base plan billing is handled by Razorpay subscriptions and add-ons are purchased via Razorpay Checkout.
        </p>
        {message ? (
          <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-red-800">
            {message}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
