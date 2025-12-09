'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { QrCode, Download, CheckCircle, Users, Search, RefreshCw, Eye, Calendar } from 'lucide-react';
import Link from 'next/link';
import { supabaseClient } from '@/lib/supabase/client';

type ScanLog = {
  id: string;
  scanned_at: string;
  raw_scan: string;
  parsed: any;
  metadata: any;
  ip: string;
};

export default function DashboardHome() {
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedScan, setSelectedScan] = useState<ScanLog | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');
  const [stats, setStats] = useState({
    total: 0,
    valid: 0,
    duplicate: 0,
    expired: 0,
    invalid: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      
      // Get current user's company
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: company } = await supabase
        .from('companies')
        .select('company_name')
        .eq('user_id', user.id)
        .single();

      if (company) {
        setCompanyName(company.company_name);
      }

      // Fetch only problematic scans (DUPLICATE, INVALID, EXPIRED, ERROR)
      // Note: In stateless system, we filter client-side by company name from parsed data
      const { data: logsData } = await supabase
        .from('scan_logs')
        .select('*')
        .in('metadata->>status', ['DUPLICATE', 'INVALID', 'EXPIRED', 'ERROR'])
        .order('scanned_at', { ascending: false })
        .limit(500);

      if (logsData && company) {
        // Filter by company name if present in parsed data
        const companyScans = logsData.filter(log => {
          // Check if parsed data contains company name
          const logCompany = log.parsed?.company || log.metadata?.company;
          return !logCompany || logCompany === company.company_name;
        });
        
        setScanLogs(companyScans);
        setStats({
          total: companyScans.length,
          valid: 0, // Not showing valid for problematic view
          duplicate: companyScans.filter(s => s.metadata?.status === 'DUPLICATE').length,
          expired: companyScans.filter(s => s.metadata?.status === 'EXPIRED').length,
          invalid: companyScans.filter(s => s.metadata?.status === 'INVALID').length
        });
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
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
    return serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
           gtin.includes(searchTerm) ||
           log.raw_scan.includes(searchTerm);
  });

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-[#0052CC] mb-2">Welcome back{companyName ? `, ${companyName}` : ''}!</h1>
          <p className="text-xl text-gray-600">⚠️ Showing your problematic scans (Duplicate/Invalid/Expired)</p>
        </div>
        <Button 
          onClick={() => setShowAnalytics(!showAnalytics)}
          className={showAnalytics ? 'bg-[#0052CC]' : 'bg-orange-500 hover:bg-orange-600'}
        >
          {showAnalytics ? 'Hide' : 'View'} Scan Details
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Total Issues</CardTitle>
            <QrCode className="h-5 w-5 text-[#0052CC]" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
            <p className="text-xs text-gray-500">Problematic scans</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition" onClick={() => setShowAnalytics(true)}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-yellow-600">Duplicate</CardTitle>
            <Users className="h-5 w-5 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{stats.duplicate}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition" onClick={() => setShowAnalytics(true)}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-orange-600">Expired</CardTitle>
            <Calendar className="h-5 w-5 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.expired}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition" onClick={() => setShowAnalytics(true)}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-red-600">Invalid</CardTitle>
            <QrCode className="h-5 w-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.invalid}</div>
          </CardContent>
        </Card>
      </div>

      {showAnalytics && (
        <Card className="border-2 border-[#0052CC]">
          <CardHeader className="bg-blue-50">
            <div className="flex justify-between items-center">
              <CardTitle className="text-[#0052CC]">Scan Analytics</CardTitle>
              <Button onClick={fetchData} disabled={loading} variant="outline" size="sm">
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search by serial, GTIN, or raw data..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Scan Logs List */}
              <div className="lg:col-span-2">
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-4 border rounded-lg hover:border-[#0052CC] cursor-pointer transition ${
                        selectedScan?.id === log.id ? 'border-[#0052CC] bg-blue-50' : ''
                      }`}
                      onClick={() => setSelectedScan(log)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-mono font-bold text-sm">
                            {log.parsed?.serialNo || 'No Serial'}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            GTIN: {log.parsed?.gtin || 'N/A'} • Batch: {log.parsed?.batchNo || 'N/A'}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {new Date(log.scanned_at).toLocaleString()}
                          </div>
                        </div>
                        <Badge className={getStatusBadge(log.metadata?.status)}>
                          {log.metadata?.status || 'UNKNOWN'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {filteredLogs.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      {searchTerm ? 'No scans found' : 'No scans recorded yet'}
                    </div>
                  )}
                </div>
              </div>

              {/* Details Panel */}
              <div className="border rounded-lg p-4 bg-gray-50">
                {selectedScan ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-gray-600">Status</label>
                      <Badge className={`${getStatusBadge(selectedScan.metadata?.status)} mt-1`}>
                        {selectedScan.metadata?.status || 'UNKNOWN'}
                      </Badge>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600">Serial Number</label>
                      <div className="font-mono text-sm p-2 bg-white rounded mt-1">
                        {selectedScan.parsed?.serialNo || 'N/A'}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-gray-600">GTIN</label>
                        <div className="text-xs mt-1">{selectedScan.parsed?.gtin || 'N/A'}</div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Batch</label>
                        <div className="text-xs mt-1">{selectedScan.parsed?.batchNo || 'N/A'}</div>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600">Expiry Date</label>
                      <div className="text-xs mt-1">{selectedScan.parsed?.expiryDate || 'N/A'}</div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600">Scanned At</label>
                      <div className="text-xs mt-1">
                        {new Date(selectedScan.scanned_at).toLocaleString()}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600">IP Address</label>
                      <div className="text-xs mt-1">{selectedScan.ip || 'N/A'}</div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-2">Raw Scan Data</label>
                      <div className="p-2 bg-white rounded text-xs font-mono break-all max-h-32 overflow-y-auto">
                        {selectedScan.raw_scan}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    <Eye className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    Click a scan to view details
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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