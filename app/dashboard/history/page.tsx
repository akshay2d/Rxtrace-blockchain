'use client';

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import Link from "next/link";

type ScanLog = {
  id: string;
  scanned_at: string;
  raw_scan: string;
  parsed: any;
  metadata: any;
  ip: string;
  scanner_printer_id: string;
};

export default function History() {
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchScanLogs = async () => {
      const { data, error } = await supabaseClient()
        .from("scan_logs")
        .select("*")
        .order("scanned_at", { ascending: false })
        .limit(500);

      if (error) {
        console.error(error);
      } else {
        setScanLogs(data || []);
      }
      setLoading(false);
    };

    fetchScanLogs();
  }, []);

  function getStatusBadge(status: string) {
    const colors: any = {
      VALID: 'bg-green-500 text-white',
      DUPLICATE: 'bg-yellow-500 text-white',
      EXPIRED: 'bg-orange-500 text-white',
      INVALID: 'bg-red-500 text-white',
      ERROR: 'bg-gray-500 text-white'
    };
    return colors[status] || 'bg-gray-500 text-white';
  }

  const filteredLogs = scanLogs.filter(log => {
    const serial = log.parsed?.serialNo || '';
    const gtin = log.parsed?.gtin || '';
    const batch = log.parsed?.batchNo || '';
    return serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
           gtin.includes(searchTerm) ||
           batch.toLowerCase().includes(searchTerm.toLowerCase()) ||
           log.raw_scan.includes(searchTerm);
  });

  if (loading) return <div className="p-10">Loading scan history...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-[#0052CC] mb-2">Scan History</h1>
          <p className="text-gray-600">View all verification scans</p>
        </div>
        <Link href="/dashboard/generate">
          <Button className="bg-orange-500 hover:bg-orange-600">
            Generate New Labels
          </Button>
        </Link>
      </div>

      <Card className="p-6">
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by serial, GTIN, batch, or raw data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b">
              <tr>
                <th className="p-4">Status</th>
                <th className="p-4">Serial Number</th>
                <th className="p-4">GTIN</th>
                <th className="p-4">Batch</th>
                <th className="p-4">Expiry</th>
                <th className="p-4">Scanned At</th>
                <th className="p-4">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="p-4">
                    <Badge className={getStatusBadge(log.metadata?.status)}>
                      {log.metadata?.status || 'UNKNOWN'}
                    </Badge>
                  </td>
                  <td className="p-4 font-mono text-sm">
                    {log.parsed?.serialNo || 'N/A'}
                  </td>
                  <td className="p-4 font-mono text-sm">{log.parsed?.gtin || 'N/A'}</td>
                  <td className="p-4">{log.parsed?.batchNo || 'N/A'}</td>
                  <td className="p-4">{log.parsed?.expiryDate || 'N/A'}</td>
                  <td className="p-4">
                    {new Date(log.scanned_at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </td>
                  <td className="p-4 text-sm text-gray-600">{log.ip || 'N/A'}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-500">
                    {searchTerm ? 'No scans found matching your search' : 'No scans recorded yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredLogs.length > 0 && (
          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredLogs.length} of {scanLogs.length} total scans
          </div>
        )}
      </Card>
    </div>
  );
}