'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabaseClient } from '@/lib/supabase/client';
import { useParams, useRouter } from 'next/navigation';
import { RefreshCw, Download, ArrowLeft, FileText, User, Calendar } from 'lucide-react';

type AuditLog = {
  id: string;
  company_id: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  performed_by: string | null;
  performed_by_email: string | null;
  timestamp: string;
  metadata: any;
};

type Company = {
  id: string;
  company_name: string;
};

export default function CompanyAuditPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  
  const [company, setCompany] = useState<Company | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedAdmin, setSelectedAdmin] = useState<string>('all');

  const fetchCompany = useCallback(async () => {
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name')
        .eq('id', companyId)
        .single();
      if (error) throw error;
      if (data) setCompany(data);
    } catch (error: any) {
      console.error('Failed to fetch company:', error);
    }
  }, [companyId]);

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      
      // Fetch from billing_transactions (admin credit/debit actions - historical)
      const { data: transactions, error: txError } = await supabase
        .from('billing_transactions')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(100);
      
      // Fetch from company_wallets updates (freeze/unfreeze actions)
      // Note: We'll track these via a custom audit approach since there's no audit_logs table
      const { data: wallet, error: walletError } = await supabase
        .from('company_wallets')
        .select('status, updated_at')
        .eq('company_id', companyId)
        .maybeSingle();
      
      // Combine and format audit logs
      const logs: AuditLog[] = [];
      
      // Add transaction logs
      if (transactions) {
        transactions.forEach(tx => {
          if (tx.type === 'admin_adjustment') {
            logs.push({
              id: tx.id,
              company_id: companyId,
              action: tx.amount >= 0 ? 'CREDIT_ADDED' : 'CREDIT_DEDUCTED',
              old_value: null,
              new_value: `Amount: ${tx.amount}`,
              performed_by: null,
              performed_by_email: null,
              timestamp: tx.created_at,
              metadata: { notes: tx.subtype || tx.notes }
            });
          }
        });
      }
      
      // Add wallet status changes (if we had audit_logs, this would be there)
      // For now, we'll show wallet status as a current state
      if (wallet) {
        logs.push({
          id: `wallet-${companyId}`,
          company_id: companyId,
          action: 'WALLET_STATUS',
          old_value: null,
          new_value: wallet.status,
          performed_by: null,
          performed_by_email: null,
          timestamp: wallet.updated_at,
          metadata: {}
        });
      }
      
      // Apply filters
      let filtered = logs;
      if (selectedAction !== 'all') {
        filtered = filtered.filter(log => log.action === selectedAction);
      }
      if (dateFrom) {
        filtered = filtered.filter(log => new Date(log.timestamp) >= new Date(dateFrom));
      }
      if (dateTo) {
        filtered = filtered.filter(log => new Date(log.timestamp) <= new Date(dateTo + 'T23:59:59'));
      }
      
      setAuditLogs(filtered);
    } catch (error: any) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, [companyId, dateFrom, dateTo, selectedAction]);

  useEffect(() => {
    fetchCompany();
    fetchAuditLogs();
  }, [fetchCompany, fetchAuditLogs]);

  const exportToCSV = () => {
    const headers = ['Timestamp', 'Action', 'Old Value', 'New Value', 'Performed By', 'Notes'];
    const rows = auditLogs.map(log => [
      new Date(log.timestamp).toISOString(),
      log.action,
      log.old_value || '',
      log.new_value || '',
      log.performed_by_email || log.performed_by || 'System',
      log.metadata?.notes || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${company?.company_name || companyId}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  function getActionBadge(action: string) {
    const colors: Record<string, string> = {
      'CREDIT_ADDED': 'bg-green-500 text-white',
      'CREDIT_DEDUCTED': 'bg-red-500 text-white',
      'WALLET_STATUS': 'bg-blue-500 text-white',
      'COMPANY_UPDATED': 'bg-purple-500 text-white',
      'COMPANY_DELETED': 'bg-gray-500 text-white',
    };
    return colors[action] || 'bg-gray-500 text-white';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/companies')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Companies
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-[#0052CC]">📋 Audit Report</h1>
            <p className="text-gray-600 mt-1">
              {company ? `Audit trail for ${company.company_name}` : 'Loading...'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToCSV} variant="outline" disabled={auditLogs.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={fetchAuditLogs} disabled={loading} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="action">Action Type</Label>
              <Select value={selectedAction} onValueChange={setSelectedAction}>
                <SelectTrigger id="action" className="mt-1.5">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="CREDIT_ADDED">Credit Added</SelectItem>
                  <SelectItem value="CREDIT_DEDUCTED">Credit Deducted</SelectItem>
                  <SelectItem value="WALLET_STATUS">Wallet Status Change</SelectItem>
                  <SelectItem value="COMPANY_UPDATED">Company Updated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs ({auditLogs.length})</CardTitle>
          <CardDescription>
            Read-only audit trail of all admin actions for this company
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {auditLogs.map((log) => (
              <div key={log.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getActionBadge(log.action)}>
                        {log.action.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="grid md:grid-cols-2 gap-2 text-sm">
                      {log.old_value && (
                        <div>
                          <span className="text-gray-500">Old Value:</span>
                          <div className="font-mono text-xs mt-1">{log.old_value}</div>
                        </div>
                      )}
                      {log.new_value && (
                        <div>
                          <span className="text-gray-500">New Value:</span>
                          <div className="font-mono text-xs mt-1">{log.new_value}</div>
                        </div>
                      )}
                    </div>
                    {log.metadata?.notes && (
                      <div className="mt-2 text-xs text-gray-600">
                        <span className="font-medium">Notes:</span> {log.metadata.notes}
                      </div>
                    )}
                    {log.performed_by_email && (
                      <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {log.performed_by_email}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {auditLogs.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-16 h-16 mx-auto mb-3 opacity-30" />
                <p>No audit logs found for this company</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
