'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';
import { Search, Filter, Download, Eye, Ban, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

type CodeRecord = {
  id: string;
  serial: string;
  gtin: string;
  batch: string;
  mfg: string | null;
  expiry: string;
  status: string;
  printer_id: string;
  issued_by: string;
  issued_at: string;
  first_scanned_at: string | null;
  scan_count?: number;
};

type ScanLog = {
  id: string;
  code_id: string;
  serial: string;
  scanned_at: string;
  scanner_printer_id: string | null;
  ip: string | null;
  metadata: any;
  parsed: any;
};

export default function AdminDashboard() {
  const [codes, setCodes] = useState<CodeRecord[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedCode, setSelectedCode] = useState<CodeRecord | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    issued: 0,
    verified: 0,
    expired: 0,
    blacklisted: 0
  });

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      
      // Fetch codes with optional status filter
      let query = supabase
        .from('codes')
        .select('*')
        .order('issued_at', { ascending: false })
        .limit(100);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: codesData, error: codesError } = await query;

      if (codesError) throw codesError;

      // Fetch scan counts for each code
      const codesWithCounts = await Promise.all((codesData || []).map(async (code) => {
        const { count } = await supabase
          .from('scan_logs')
          .select('*', { count: 'exact', head: true })
          .eq('code_id', code.id);
        return { ...code, scan_count: count || 0 };
      }));

      setCodes(codesWithCounts);

      // Fetch stats
      const { data: allCodes } = await supabase.from('codes').select('status');
      if (allCodes) {
        setStats({
          total: allCodes.length,
          issued: allCodes.filter(c => c.status === 'issued').length,
          verified: allCodes.filter(c => c.status === 'verified').length,
          expired: allCodes.filter(c => c.status === 'expired').length,
          blacklisted: allCodes.filter(c => c.status === 'blacklisted').length
        });
      }

    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchScanHistory(codeId: string) {
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('scan_logs')
        .select('*')
        .eq('code_id', codeId)
        .order('scanned_at', { ascending: false });

      if (error) throw error;
      setScanLogs(data || []);
    } catch (error) {
      console.error('Error fetching scan history:', error);
    }
  }

  async function updateCodeStatus(codeId: string, newStatus: string) {
    if (!confirm(`Are you sure you want to change the status to ${newStatus.toUpperCase()}?`)) {
      return;
    }
    
    try {
      const supabase = supabaseClient();
      const { error } = await supabase
        .from('codes')
        .update({ status: newStatus })
        .eq('id', codeId);

      if (error) throw error;
      
      alert(`✓ Status successfully updated to ${newStatus.toUpperCase()}`);
      fetchData();
      if (selectedCode?.id === codeId) {
        setSelectedCode({ ...selectedCode, status: newStatus });
      }
    } catch (error: any) {
      console.error('Error updating status:', error);
      alert(`✗ Failed to update status: ${error.message || 'Unknown error'}`);
    }
  }

  async function exportToCSV() {
    const csv = [
      ['Serial', 'GTIN', 'Batch', 'Expiry', 'Status', 'Issued At', 'Scans'].join(','),
      ...filteredCodes.map(c => [
        c.serial,
        c.gtin,
        c.batch,
        c.expiry,
        c.status,
        new Date(c.issued_at).toLocaleString(),
        c.scan_count || 0
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codes_${Date.now()}.csv`;
    a.click();
  }

  const filteredCodes = codes.filter(code => {
    const search = searchTerm.toLowerCase();
    return (
      code.serial.toLowerCase().includes(search) ||
      code.gtin.includes(search) ||
      code.batch.toLowerCase().includes(search)
    );
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; icon: React.ReactNode }> = {
      issued: { color: 'bg-blue-500', icon: <CheckCircle className="w-3 h-3" /> },
      verified: { color: 'bg-green-500', icon: <CheckCircle className="w-3 h-3" /> },
      expired: { color: 'bg-orange-500', icon: <AlertTriangle className="w-3 h-3" /> },
      blacklisted: { color: 'bg-red-500', icon: <Ban className="w-3 h-3" /> },
      recalled: { color: 'bg-red-600', icon: <XCircle className="w-3 h-3" /> }
    };
    const variant = variants[status] || variants.issued;
    return (
      <Badge className={`${variant.color} text-white flex items-center gap-1`}>
        {variant.icon}
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0052CC]">Admin Dashboard</h1>
        <p className="text-gray-600">Monitor and manage all generated codes</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Codes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-blue-500" onClick={() => setStatusFilter('issued')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Issued</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.issued.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-green-500" onClick={() => setStatusFilter('verified')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.verified.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-orange-500" onClick={() => setStatusFilter('expired')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-600">Expired</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.expired.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-red-500" onClick={() => setStatusFilter('blacklisted')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Blacklisted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.blacklisted.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search by serial, GTIN, or batch..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border rounded-md"
            >
              <option value="all">All Status</option>
              <option value="issued">Issued</option>
              <option value="verified">Verified</option>
              <option value="expired">Expired</option>
              <option value="blacklisted">Blacklisted</option>
              <option value="recalled">Recalled</option>
            </select>
            <Button onClick={exportToCSV} className="bg-green-600 hover:bg-green-700">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Codes Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Generated Codes ({filteredCodes.length})</CardTitle>
            <div className="text-sm text-gray-600">
              Click dropdown in Actions column to change status
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : filteredCodes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No codes found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-medium">Serial</th>
                    <th className="text-left p-3 font-medium">GTIN</th>
                    <th className="text-left p-3 font-medium">Batch</th>
                    <th className="text-left p-3 font-medium">Expiry</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Scans</th>
                    <th className="text-left p-3 font-medium">Issued</th>
                    <th className="text-left p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCodes.map((code) => (
                    <tr key={code.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-mono text-sm">{code.serial}</td>
                      <td className="p-3 text-sm">{code.gtin}</td>
                      <td className="p-3 text-sm">{code.batch}</td>
                      <td className="p-3 text-sm">{code.expiry}</td>
                      <td className="p-3">{getStatusBadge(code.status)}</td>
                      <td className="p-3 text-sm">
                        <span className={code.scan_count! > 0 ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                          {code.scan_count}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {new Date(code.issued_at).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedCode(code);
                              fetchScanHistory(code.id);
                            }}
                            title="View Scan History"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <select
                            value={code.status}
                            onChange={(e) => updateCodeStatus(code.id, e.target.value)}
                            className="text-sm border-2 border-gray-300 rounded-md px-3 py-1 font-medium hover:border-[#0052CC] focus:border-[#0052CC] focus:ring-2 focus:ring-[#0052CC] focus:ring-opacity-20 cursor-pointer"
                            title="Change Status"
                          >
                            <option value="issued">✓ Issued</option>
                            <option value="verified">✓ Verified</option>
                            <option value="expired">⚠ Expired</option>
                            <option value="blacklisted">✗ Blacklisted</option>
                            <option value="recalled">✗ Recalled</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scan History Modal */}
      {selectedCode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Scan History</CardTitle>
                  <p className="text-sm text-gray-600 mt-1">Serial: <span className="font-mono">{selectedCode.serial}</span></p>
                  <div className="flex gap-2 mt-2">
                    {getStatusBadge(selectedCode.status)}
                    <Badge variant="outline">GTIN: {selectedCode.gtin}</Badge>
                    <Badge variant="outline">Batch: {selectedCode.batch}</Badge>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setSelectedCode(null)}>Close</Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {scanLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No scans recorded yet</div>
              ) : (
                <div className="space-y-4">
                  {scanLogs.map((log) => (
                    <div key={log.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold text-sm">
                            {new Date(log.scanned_at).toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            IP: {log.ip || 'Unknown'} | Scanner: {log.scanner_printer_id || 'N/A'}
                          </div>
                        </div>
                        <Badge className={
                          log.metadata?.status === 'VALID' ? 'bg-green-500' :
                          log.metadata?.status === 'DUPLICATE' ? 'bg-yellow-500' :
                          log.metadata?.status === 'BLACKLIST' ? 'bg-red-500' : 'bg-gray-500'
                        }>
                          {log.metadata?.status || 'UNKNOWN'}
                        </Badge>
                      </div>
                      {log.parsed && (
                        <div className="text-xs bg-gray-100 p-2 rounded mt-2 font-mono">
                          {JSON.stringify(log.parsed, null, 2)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
