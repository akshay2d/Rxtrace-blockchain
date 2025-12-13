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
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [topupAmount, setTopupAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch all companies
      const { data: companiesData } = await supabaseClient()
        .from("companies")
        .select("id, company_name")
        .order("company_name");

      // Fetch all wallets
      const { data: walletsData } = await supabaseClient()
        .from("company_wallets")
        .select("*")
        .order("company_id");

      setCompanies(companiesData || []);
      setWallets(walletsData || []);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleTopup() {
    if (!selectedCompany || !topupAmount || Number(topupAmount) <= 0) {
      setMessage("Please select a company and enter a valid amount");
      return;
    }

    setProcessing(true);
    setMessage(null);

    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: selectedCompany,
          amount: Number(topupAmount),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(`✅ Topup successful! New balance: ₹${data.balance?.toFixed(2)}`);
        setTopupAmount("");
        fetchData(); // Refresh data
      } else {
        setMessage(`❌ Error: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setMessage(`❌ Error: ${String(err)}`);
    } finally {
      setProcessing(false);
    }
  }

  const getCompanyName = (companyId: string) => {
    return companies.find((c) => c.id === companyId)?.company_name || companyId;
  };

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

      {/* Topup Section */}
      <Card className="p-6 mb-8 bg-gradient-to-br from-blue-50 to-purple-50">
        <h2 className="text-xl font-semibold mb-4">Add Credits (Top-up)</h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">Select Company</label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full p-2 border rounded"
            >
              <option value="">-- Select Company --</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.company_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Amount (₹)</label>
            <input
              type="number"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full p-2 border rounded"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <Button onClick={handleTopup} disabled={processing} className="bg-orange-500 hover:bg-orange-600">
          {processing ? "Processing..." : "Add Credits"}
        </Button>

        {message && (
          <div className={`mt-4 p-3 rounded ${message.startsWith("✅") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {message}
          </div>
        )}
      </Card>

      {/* Wallets Overview */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Company Wallets</h2>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3">Company</th>
                <th className="text-right p-3">Balance</th>
                <th className="text-right p-3">Credit Limit</th>
                <th className="text-right p-3">Available</th>
                <th className="text-center p-3">Status</th>
                <th className="text-left p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {wallets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-6 text-gray-500">
                    No wallet data found
                  </td>
                </tr>
              ) : (
                wallets.map((wallet) => {
                  const available = wallet.balance + wallet.credit_limit;
                  return (
                    <tr key={wallet.company_id} className="border-b hover:bg-gray-50">
                      <td className="p-3">{getCompanyName(wallet.company_id)}</td>
                      <td className={`text-right p-3 font-semibold ${wallet.balance < 0 ? "text-red-600" : "text-green-600"}`}>
                        ₹{wallet.balance.toFixed(2)}
                      </td>
                      <td className="text-right p-3">₹{wallet.credit_limit.toFixed(2)}</td>
                      <td className={`text-right p-3 font-bold ${available < 0 ? "text-red-600" : "text-blue-600"}`}>
                        ₹{available.toFixed(2)}
                      </td>
                      <td className="text-center p-3">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            wallet.status === "ACTIVE"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {wallet.status}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {new Date(wallet.updated_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-6 mt-6">
        <Card className="p-6 bg-blue-50">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total Companies</h3>
          <p className="text-3xl font-bold text-blue-600">{companies.length}</p>
        </Card>

        <Card className="p-6 bg-green-50">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Active Wallets</h3>
          <p className="text-3xl font-bold text-green-600">
            {wallets.filter((w) => w.status === "ACTIVE").length}
          </p>
        </Card>

        <Card className="p-6 bg-orange-50">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total Balance</h3>
          <p className="text-3xl font-bold text-orange-600">
            ₹{wallets.reduce((sum, w) => sum + w.balance, 0).toFixed(2)}
          </p>
        </Card>
      </div>
    </div>
  );
}
