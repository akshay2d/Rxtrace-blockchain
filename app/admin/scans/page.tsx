'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';
import { Search, RefreshCw, Eye, AlertCircle } from 'lucide-react';

type ScanLog = {
  id: string;
  scanned_at: string;
  raw_scan: string;
  parsed: any;
  metadata: any;
  ip: string;
  scanner_printer_id: string | null;
};

export default function SystemScans() {
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedScan, setSelectedScan] = useState<ScanLog | null>(null);
  const [showOnlyProblematic, setShowOnlyProblematic] = useState(true);

  const fetchScans = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      let query = supabase
        .from('scan_logs')
        .select('*')
        .order('scanned_at', { ascending: false });
      if (showOnlyProblematic) {
        query = query.in('metadata->>status', ['DUPLICATE', 'INVALID', 'EXPIRED', 'ERROR']);
      }
      const { data, error } = await query.limit(500);
      if (error) throw error;
      if (data) setScanLogs(data);
    } catch (error: any) {
      alert('Failed to fetch scans: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [showOnlyProblematic]);

  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

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
    const ip = log.ip || '';
    return serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
           gtin.includes(searchTerm) ||
           batch.toLowerCase().includes(searchTerm.toLowerCase()) ||
           ip.includes(searchTerm) ||
           log.raw_scan.includes(searchTerm);
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-orange-600">🔍 System-wide Scans</h1>
          <p className="text-gray-600 mt-1">
            {showOnlyProblematic 
              ? '⚠️ Showing only problematic scans (Duplicate/Invalid/Expired/Error)' 
              : 'Showing all scans'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowOnlyProblematic(!showOnlyProblematic)} 
            variant={showOnlyProblematic ? "default" : "outline"}
            className={showOnlyProblematic ? "bg-red-500 hover:bg-red-600" : ""}
          >
            <AlertCircle className="w-4 h-4 mr-2" />
            {showOnlyProblematic ? 'Issues Only' : 'Show All'}
          </Button>
          <Button onClick={fetchScans} disabled={loading} className="bg-orange-500 hover:bg-orange-600">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
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
                onClick={() => setSelectedScan(log)}
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

      {/* Scan Details Panel */}
      {selectedScan && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Scan Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Badge className={getStatusBadge(selectedScan.metadata?.status)}>
                  {selectedScan.metadata?.status || 'UNKNOWN'}
                </Badge>
              </div>
              <div>
                <span className="text-gray-500">Serial:</span> <span className="font-mono">{selectedScan.parsed?.serialNo || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">GTIN:</span> <span className="font-mono">{selectedScan.parsed?.gtin || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Batch:</span> <span className="font-mono">{selectedScan.parsed?.batchNo || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Expiry:</span> <span className="font-mono">{selectedScan.parsed?.expiryDate || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Scanned At:</span> <span>{new Date(selectedScan.scanned_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-500">IP Address:</span> <span>{selectedScan.ip || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Printer ID:</span> <span className="font-mono">{selectedScan.scanner_printer_id || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Raw Scan Data:</span>
                <div className="p-2 bg-gray-100 rounded text-xs font-mono break-all max-h-32 overflow-y-auto">
                  {selectedScan.raw_scan}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
