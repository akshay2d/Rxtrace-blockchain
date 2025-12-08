'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';
import { Search, RefreshCw, Eye, AlertCircle } from 'lucide-react';

type Code = {
  id: string;
  serial: string;
  gtin: string;
  batch: string;
  expiry: string;
  status: string;
  issued_at: string;
  first_scanned_at: string | null;
};

type ScanLog = {
  id: string;
  scanned_at: string;
  metadata: any;
};

export default function AdminDashboard() {
  const [codes, setCodes] = useState<Code[]>([]);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCode, setSelectedCode] = useState<Code | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    issued: 0,
    verified: 0,
    expired: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      
      const { data: codesData } = await supabase
        .from('codes')
        .select('*')
        .order('issued_at', { ascending: false })
        .limit(100);

      if (codesData) {
        setCodes(codesData);
        setStats({
          total: codesData.length,
          issued: codesData.filter(c => c.status === 'issued').length,
          verified: codesData.filter(c => c.status === 'verified').length,
          expired: codesData.filter(c => c.status === 'expired').length
        });
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function viewScanHistory(code: Code) {
    setSelectedCode(code);
    try {
      const supabase = supabaseClient();
      const { data } = await supabase
        .from('scan_logs')
        .select('*')
        .eq('code_id', code.id)
        .order('scanned_at', { ascending: false });
      
      setScanLogs(data || []);
    } catch (error) {
      console.error('Error:', error);
    }
  }

  async function updateStatus(codeId: string, newStatus: string) {
    try {
      const supabase = supabaseClient();
      const { error } = await supabase
        .from('codes')
        .update({ status: newStatus })
        .eq('id', codeId);

      if (error) throw error;
      
      fetchData();
      if (selectedCode?.id === codeId) {
        setSelectedCode({ ...selectedCode, status: newStatus });
      }
      alert(`Status updated to ${newStatus}`);
    } catch (error: any) {
      alert('Failed to update: ' + error.message);
    }
  }

  const filteredCodes = codes.filter(code =>
    code.serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
    code.gtin.includes(searchTerm) ||
    code.batch.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#0052CC]">Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">Manage codes and view scan history</p>
        </div>
        <Button onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Total Codes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-600">Issued</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.issued}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-600">Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.verified}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-orange-600">Expired</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.expired}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by serial, GTIN, or batch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Codes List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>All Codes ({filteredCodes.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredCodes.map((code) => (
                <div
                  key={code.id}
                  className={`p-4 border rounded-lg hover:border-[#0052CC] cursor-pointer transition ${
                    selectedCode?.id === code.id ? 'border-[#0052CC] bg-blue-50' : ''
                  }`}
                  onClick={() => viewScanHistory(code)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-mono font-bold">{code.serial}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        GTIN: {code.gtin} • Batch: {code.batch}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Issued: {new Date(code.issued_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge className={
                      code.status === 'verified' ? 'bg-green-500 text-white' :
                      code.status === 'expired' ? 'bg-orange-500 text-white' :
                      code.status === 'blacklisted' ? 'bg-red-500 text-white' :
                      'bg-blue-500 text-white'
                    }>
                      {code.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {filteredCodes.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  {searchTerm ? 'No codes found' : 'No codes generated yet'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Details Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Details & Actions</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedCode ? (
              <div className="space-y-4">
                {/* Code Info */}
                <div>
                  <label className="text-sm font-medium text-gray-600">Serial</label>
                  <div className="font-mono p-2 bg-gray-100 rounded mt-1">{selectedCode.serial}</div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">GTIN</label>
                    <div className="text-sm mt-1">{selectedCode.gtin}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Batch</label>
                    <div className="text-sm mt-1">{selectedCode.batch}</div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-600">Expiry</label>
                  <div className="text-sm mt-1">{selectedCode.expiry}</div>
                </div>

                {/* Status Control */}
                <div>
                  <label className="text-sm font-medium text-gray-600 block mb-2">Update Status</label>
                  <div className="space-y-2">
                    {['issued', 'verified', 'expired', 'blacklisted', 'recalled'].map((status) => (
                      <Button
                        key={status}
                        onClick={() => updateStatus(selectedCode.id, status)}
                        className={`w-full justify-start ${
                          selectedCode.status === status 
                            ? 'bg-[#0052CC] text-white hover:bg-[#0052CC]' 
                            : 'bg-white text-gray-700 border hover:bg-gray-50'
                        }`}
                        disabled={selectedCode.status === status}
                      >
                        <span className="mr-2">
                          {status === 'verified' ? '✓' : 
                           status === 'expired' ? '⚠' :
                           status === 'blacklisted' ? '✗' :
                           status === 'recalled' ? '✗' : '○'}
                        </span>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Scan History */}
                <div>
                  <label className="text-sm font-medium text-gray-600">Scan History</label>
                  <div className="mt-2 max-h-60 overflow-y-auto space-y-2">
                    {scanLogs.length > 0 ? (
                      scanLogs.map((log) => (
                        <div key={log.id} className="p-3 bg-gray-50 rounded text-sm">
                          <div className="font-medium">{new Date(log.scanned_at).toLocaleString()}</div>
                          <div className="text-gray-600 text-xs mt-1">
                            Status: {log.metadata?.status || 'N/A'}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        No scans yet
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Click a code to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
