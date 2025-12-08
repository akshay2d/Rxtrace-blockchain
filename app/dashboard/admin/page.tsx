'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';
import { Search, RefreshCw, Eye, AlertCircle, Users, Activity, TrendingUp, Database } from 'lucide-react';

type ScanLog = {
  id: string;
  scanned_at: string;
  raw_scan: string;
  parsed: any;
  metadata: any;
  ip: string;
  scanner_printer_id: string | null;
};

type Company = {
  id: string;
  company_name: string;
  user_id: string;
  created_at: string;
};

type User = {
  id: string;
  email: string;
  created_at: string;
};

export default function AdminDashboard() {
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedScan, setSelectedScan] = useState<ScanLog | null>(null);
  const [relatedScans, setRelatedScans] = useState<ScanLog[]>([]);
  const [showOnlyProblematic, setShowOnlyProblematic] = useState(true); // Default: show only issues
  const [stats, setStats] = useState({
    totalScans: 0,
    totalCompanies: 0,
    validScans: 0,
    duplicateScans: 0,
    expiredScans: 0,
    invalidScans: 0,
    last24h: 0
  });

  useEffect(() => {
    fetchData();
  }, [showOnlyProblematic]); // Re-fetch when filter changes

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      
      // Fetch scan logs - only problematic ones (DUPLICATE, INVALID, EXPIRED, ERROR)
      let query = supabase
        .from('scan_logs')
        .select('*')
        .order('scanned_at', { ascending: false });

      if (showOnlyProblematic) {
        query = query.in('metadata->>status', ['DUPLICATE', 'INVALID', 'EXPIRED', 'ERROR']);
      }
      
      const { data: logsData } = await query.limit(500);

      // Fetch companies
      const { data: companiesData } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (logsData) {
        setScanLogs(logsData);
        
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        setStats({
          totalScans: logsData.length,
          totalCompanies: companiesData?.length || 0,
          validScans: logsData.filter(s => s.metadata?.status === 'VALID').length,
          duplicateScans: logsData.filter(s => s.metadata?.status === 'DUPLICATE').length,
          expiredScans: logsData.filter(s => s.metadata?.status === 'EXPIRED').length,
          invalidScans: logsData.filter(s => s.metadata?.status === 'INVALID').length,
          last24h: logsData.filter(s => new Date(s.scanned_at) > yesterday).length
        });
      }

      if (companiesData) {
        setCompanies(companiesData);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function viewRelatedScans(scan: ScanLog) {
    setSelectedScan(scan);
    try {
      const serial = scan.parsed?.serialNo;
      const gtin = scan.parsed?.gtin;
      
      if (!serial) return;
      
      const supabase = supabaseClient();
      const { data } = await supabase
        .from('scan_logs')
        .select('*')
        .eq('parsed->>serialNo', serial)
        .order('scanned_at', { ascending: false });
      
      setRelatedScans(data || []);
    } catch (error) {
      console.error('Error:', error);
    }
  }

  const filteredLogs = scanLogs.filter(log => {
    const serial = log.parsed?.serialNo || '';
    const gtin = log.parsed?.gtin || '';
    const batch = log.parsed?.batchNo || '';
    const ip = log.ip || '';
    return serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
           gtin.includes(searchTerm) ||
           batch.toLowerCase().includes(searchTerm.toLowerCase()) ||
           ip.includes(searchTerm) ||
           log.raw_scan.includes(searchTerm);
  });

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-orange-600">🔐 Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">
            {showOnlyProblematic 
              ? '⚠️ Showing only problematic scans (Duplicate/Invalid/Expired/Error)' 
              : 'Showing all scans'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => {
              setShowOnlyProblematic(!showOnlyProblematic);
              // Refresh will happen via useEffect
            }} 
            variant={showOnlyProblematic ? "default" : "outline"}
            className={showOnlyProblematic ? "bg-red-500 hover:bg-red-600" : ""}
          >
            <AlertCircle className="w-4 h-4 mr-2" />
            {showOnlyProblematic ? 'Issues Only' : 'Show All'}
          </Button>
          <Button onClick={fetchData} disabled={loading} className="bg-orange-500 hover:bg-orange-600">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#0052CC]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Database className="w-4 h-4" /> Total Scans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#0052CC]">{stats.totalScans}</div>
            <p className="text-xs text-gray-500 mt-1">Last 500 records</p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Last 24h
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.last24h}</div>
            <p className="text-xs text-gray-500 mt-1">Recent activity</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Users className="w-4 h-4" /> Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.totalCompanies}</div>
            <p className="text-xs text-gray-500 mt-1">Registered</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Valid Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {stats.totalScans > 0 ? Math.round((stats.validScans / stats.totalScans) * 100) : 0}%
            </div>
            <p className="text-xs text-gray-500 mt-1">{stats.validScans} valid scans</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Scan Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">
                {stats.validScans}
              </div>
              <div>
                <div className="font-semibold text-green-700">Valid</div>
                <div className="text-xs text-gray-600">Authentic products</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg">
              <div className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold">
                {stats.duplicateScans}
              </div>
              <div>
                <div className="font-semibold text-yellow-700">Duplicate</div>
                <div className="text-xs text-gray-600">Re-scanned codes</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg">
              <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                {stats.expiredScans}
              </div>
              <div>
                <div className="font-semibold text-orange-700">Expired</div>
                <div className="text-xs text-gray-600">Past expiry date</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg">
              <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white font-bold">
                {stats.invalidScans}
              </div>
              <div>
                <div className="font-semibold text-red-700">Invalid</div>
                <div className="text-xs text-gray-600">Malformed codes</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by serial, GTIN, batch, IP address, or raw scan data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Scan Logs List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {showOnlyProblematic && <AlertCircle className="w-5 h-5 text-red-500" />}
              {showOnlyProblematic ? 'Problematic Scans' : 'Recent Scans'} ({filteredLogs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-4 border rounded-lg hover:border-orange-500 cursor-pointer transition ${
                    selectedScan?.id === log.id ? 'border-orange-500 bg-orange-50' : ''
                  }`}
                  onClick={() => viewRelatedScans(log)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-mono font-bold text-sm">
                        {log.parsed?.serialNo || 'No Serial'}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        GTIN: {log.parsed?.gtin || 'N/A'} • Batch: {log.parsed?.batchNo || 'N/A'}
                      </div>
                      <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                        <span>{new Date(log.scanned_at).toLocaleString()}</span>
                        {log.ip && <span>• IP: {log.ip}</span>}
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
          </CardContent>
        </Card>

        {/* Details Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Scan Details</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedScan ? (
              <div className="space-y-4">
                {/* Status Badge */}
                <div>
                  <label className="text-sm font-medium text-gray-600">Status</label>
                  <div className="mt-1">
                    <Badge className={getStatusBadge(selectedScan.metadata?.status)}>
                      {selectedScan.metadata?.status || 'UNKNOWN'}
                    </Badge>
                  </div>
                </div>

                {/* Scan Info */}
                <div>
                  <label className="text-sm font-medium text-gray-600">Serial Number</label>
                  <div className="font-mono p-2 bg-gray-100 rounded mt-1 text-sm break-all">
                    {selectedScan.parsed?.serialNo || 'N/A'}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">GTIN</label>
                    <div className="text-sm mt-1">{selectedScan.parsed?.gtin || 'N/A'}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Batch</label>
                    <div className="text-sm mt-1">{selectedScan.parsed?.batchNo || 'N/A'}</div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-600">Expiry Date</label>
                  <div className="text-sm mt-1">{selectedScan.parsed?.expiryDate || 'N/A'}</div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-600">Scanned At</label>
                  <div className="text-sm mt-1">{new Date(selectedScan.scanned_at).toLocaleString()}</div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-600">IP Address</label>
                  <div className="text-sm mt-1">{selectedScan.ip || 'N/A'}</div>
                </div>

                {selectedScan.scanner_printer_id && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Printer ID</label>
                    <div className="text-sm mt-1 font-mono">{selectedScan.scanner_printer_id}</div>
                  </div>
                )}

                {/* Raw Data */}
                <div>
                  <label className="text-sm font-medium text-gray-600 block mb-2">Raw Scan Data</label>
                  <div className="p-2 bg-gray-100 rounded text-xs font-mono break-all max-h-32 overflow-y-auto">
                    {selectedScan.raw_scan}
                  </div>
                </div>

                {/* Related Scans */}
                <div>
                  <label className="text-sm font-medium text-gray-600">Related Scans (Same Serial)</label>
                  <div className="mt-2 max-h-60 overflow-y-auto space-y-2">
                    {relatedScans.length > 0 ? (
                      <>
                        <div className="text-xs text-gray-500 mb-2">
                          Found {relatedScans.length} scan(s) with this serial number
                        </div>
                        {relatedScans.map((log) => (
                          <div key={log.id} className="p-3 bg-gray-50 rounded text-sm border-l-4 border-l-orange-500">
                            <div className="flex justify-between items-center">
                              <div className="font-medium">{new Date(log.scanned_at).toLocaleString()}</div>
                              <Badge className={getStatusBadge(log.metadata?.status)}>
                                {log.metadata?.status}
                              </Badge>
                            </div>
                            {log.ip && (
                              <div className="text-gray-600 text-xs mt-1">IP: {log.ip}</div>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No related scans found
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Click a scan to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Companies Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" /> Registered Companies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((company) => (
              <div key={company.id} className="p-4 border rounded-lg hover:border-orange-500 transition">
                <div className="font-semibold text-[#0052CC]">{company.company_name}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Registered: {new Date(company.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
            {companies.length === 0 && (
              <div className="col-span-3 text-center py-8 text-gray-500">
                No companies registered yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
