'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Batch = {
  id: string;
  company_name: string;
  sku_name: string;
  gtin: string;
  batch_no: string;
  mfd: string;
  expiry: string;
  mrp: number;
  labels_count: number;
  generated_at: string;
};

export default function History() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBatches = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("product_batches")
        .select("*")
        .eq("user_id", user.id)
        .order("generated_at", { ascending: false });

      if (error) {
        console.error(error);
      } else {
        setBatches(data || []);
      }
      setLoading(false);
    };

    fetchBatches();
  }, []);

  if (loading) return <div className="p-10 text-white">Loading history...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-10">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Label Generation History</h1>

        <div className="mb-8">
          <Link href="/dashboard/generate">
            <Button className="bg-cyan-400 hover:bg-cyan-300 text-black font-bold">
              Generate New Labels
            </Button>
          </Link>
        </div>

        <Card className="bg-white/5 backdrop-blur border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="p-4">Company</th>
                  <th className="p-4">SKU Name</th>
                  <th className="p-4">GTIN</th>
                  <th className="p-4">Batch</th>
                  <th className="p-4">MFD</th>
                  <th className="p-4">Expiry</th>
                  <th className="p-4">MRP</th>
                  <th className="p-4 text-right">Labels</th>
                  <th className="p-4">Generated On</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-4">{batch.company_name}</td>
                    <td className="p-4">{batch.sku_name}</td>
                    <td className="p-4 font-mono text-sm">{batch.gtin}</td>
                    <td className="p-4">{batch.batch_no}</td>
                    <td className="p-4">
                      {new Date(batch.mfd).toLocaleDateString("en-IN")}
                    </td>
                    <td className="p-4">
                      {new Date(batch.expiry).toLocaleDateString("en-IN")}
                    </td>
                    <td className="p-4">₹{batch.mrp.toFixed(2)}</td>
                    <td className="p-4 text-right font-bold text-cyan-400">
                      {batch.labels_count.toLocaleString()}
                    </td>
                    <td className="p-4">
                      {new Date(batch.generated_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="p-4">
                      <Button size="sm" variant="outline">
                        Download All
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}