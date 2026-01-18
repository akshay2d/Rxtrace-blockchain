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
  status?: string;
  ip: string;
  scanner_printer_id: string;
};

export default function History() {
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const fetchScanLogs = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabaseClient().auth.getUser();
        
        if (!user) {
          setError("Please sign in to view scan activity.");
          setLoading(false);
          return;
        }

        // Fetch scan logs (scan_logs table uses RLS or is global for verification logs)
        const { data, error: fetchError } = await supabaseClient()
          .from("scan_logs")
          .select("*")
          .order("scanned_at", { ascending: false })
          .limit(500);

        if (fetchError) {
          console.error("Scan logs fetch error:", fetchError);
          // If table doesn't exist or access denied, show empty state instead of error
          if (fetchError.code === '42P01' || fetchError.code === 'PGRST116') {
            setScanLogs([]);
          } else {
            setError("Failed to load scan activity. Please try again later.");
          }
        } else {
          setScanLogs(data || []);
        }
      } catch (err: any) {
        console.error(err);
        setError("An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchScanLogs();
  }, []);

  // Helper: Check if date is expired (format: YYMMDD or YYYY-MM-DD or DD-MM-YYYY)
  function isExpired(expiryStr: string): boolean {
    if (!expiryStr) return false;
    try {
      let year: number, month: number, day: number;
      
      if (expiryStr.includes('-')) {
        // Format: YYYY-MM-DD or DD-MM-YYYY
        const parts = expiryStr.split('-');
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          year = parseInt(parts[0]);
          month = parseInt(parts[1]);
          day = parseInt(parts[2]);
        } else {
          // DD-MM-YYYY
          day = parseInt(parts[0]);
          month = parseInt(parts[1]);
          year = parseInt(parts[2]);
        }
      } else if (expiryStr.length === 6) {
        // Format: YYMMDD
        year = 2000 + parseInt(expiryStr.substring(0, 2));
        month = parseInt(expiryStr.substring(2, 4));
        day = parseInt(expiryStr.substring(4, 6));
      } else {
        return false; // Unknown format, assume not expired
      }

      const expiryDate = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      return expiryDate < today;
    } catch {
      return false;
    }
  }

  // Helper: Get expiry status from scan log
  function getExpiryStatus(log: ScanLog): "VALID" | "EXPIRED" | "UNKNOWN" {
    // First check metadata.expiry_status (set by backend)
    if (log.metadata?.expiry_status) {
      return log.metadata.expiry_status;
    }
    
    // Fallback: evaluate expiry from parsed expiryDate
    if (log.parsed?.expiryDate) {
      return isExpired(log.parsed.expiryDate) ? "EXPIRED" : "VALID";
    }
    
    return "UNKNOWN";
  }

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

  if (loading) return <div className="p-10">Loading scan activity...</div>;

  if (error) {
    return (
      <div className="p-10">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-1.5">Scan Logs</h1>
          <p className="text-sm text-gray-600">Complete audit trail of all product scans</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="border-gray-300">
            Export
          </Button>
          <Link href="/dashboard/generate">
            <Button className="bg-blue-600 hover:bg-blue-700">
              Generate Labels
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by serial, GTIN, batch, or raw data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <select className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>All Scan Types</option>
              <option>Unit</option>
              <option>Box</option>
              <option>Carton</option>
              <option>SSCC</option>
            </select>
            <Input
              type="date"
              className="w-40 border-gray-300 text-sm"
              placeholder="Date range"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Expiry Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Scan Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date & Time</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Scan Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">GTIN / Code</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Batch</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Expiry</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Serial Number</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLogs.map((log) => {
                const expiryStatus = getExpiryStatus(log);
                const isExpiredProduct = expiryStatus === "EXPIRED";
                const scanType = log.parsed?.sscc ? 'SSCC' : log.parsed?.gtin ? 'Unit' : 'Unknown';
                
                return (
                  <tr 
                    key={log.id} 
                    className={`hover:bg-gray-50 transition ${isExpiredProduct ? 'bg-red-50/50' : expiryStatus === 'VALID' ? 'bg-green-50/50' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {expiryStatus === "VALID" ? (
                        <div className="flex items-center gap-2">
                          <span className="text-green-600 text-lg">✔</span>
                          <span className="text-sm font-medium text-green-700">VALID PRODUCT</span>
                        </div>
                      ) : expiryStatus === "EXPIRED" ? (
                        <div className="flex items-center gap-2">
                          <span className="text-red-600 text-lg">❌</span>
                          <span className="text-sm font-medium text-red-700">EXPIRED PRODUCT</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className={getStatusBadge(log.metadata?.status || log.status || 'UNKNOWN')}>
                        {log.metadata?.status || log.status || 'UNKNOWN'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(log.scanned_at).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-700">{scanType}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono text-sm text-gray-900">{log.parsed?.gtin || log.parsed?.sscc || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {log.parsed?.batchNo || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {log.parsed?.expiryDate || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono text-sm text-gray-900">{log.parsed?.serialNo || 'N/A'}</span>
                    </td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="text-gray-500">
                      <p className="text-sm font-medium mb-1">
                        {searchTerm ? 'No scans found matching your search' : 'No scans recorded yet'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {!searchTerm && 'Scans will appear here as products are verified'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredLogs.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">{filteredLogs.length}</span> of{' '}
              <span className="font-medium">{scanLogs.length}</span> scans
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}