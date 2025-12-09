'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabaseClient } from '@/lib/supabase/client';
import { Building2, Users, Activity, TrendingUp, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

type Company = {
  id: string;
  company_name: string;
  created_at: string;
  user_id: string;
};

type Stats = {
  totalCompanies: number;
  totalUsers: number;
  totalScans: number;
  validScans: number;
  duplicateScans: number;
  expiredScans: number;
  invalidScans: number;
  last24h: number;
};

export default function AdminDashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalCompanies: 0,
    totalUsers: 0,
    totalScans: 0,
    validScans: 0,
    duplicateScans: 0,
    expiredScans: 0,
    invalidScans: 0,
    last24h: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      
      // Fetch companies
      const { data: companiesData } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch scan logs
      const { data: logsData } = await supabase
        .from('scan_logs')
        .select('*')
        .order('scanned_at', { ascending: false })
        .limit(1000);

      if (companiesData) {
        setCompanies(companiesData);
      }

      if (logsData) {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        setStats({
          totalCompanies: companiesData?.length || 0,
          totalUsers: companiesData?.length || 0, // Assuming 1 user per company for now
          totalScans: logsData.length,
          validScans: logsData.filter(s => s.metadata?.status === 'VALID').length,
          duplicateScans: logsData.filter(s => s.metadata?.status === 'DUPLICATE').length,
          expiredScans: logsData.filter(s => s.metadata?.status === 'EXPIRED').length,
          invalidScans: logsData.filter(s => s.metadata?.status === 'INVALID').length,
          last24h: logsData.filter(s => new Date(s.scanned_at) > yesterday).length
        });
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">🔐 Super Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">System-wide monitoring and management</p>
        </div>
        <Button onClick={fetchData} disabled={loading} className="bg-orange-500 hover:bg-orange-600">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#0052CC]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Total Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#0052CC]">{stats.totalCompanies}</div>
            <p className="text-xs text-gray-500 mt-1">Registered organizations</p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Users className="w-4 h-4" /> Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.totalUsers}</div>
            <p className="text-xs text-gray-500 mt-1">Active accounts</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Total Scans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.totalScans}</div>
            <p className="text-xs text-gray-500 mt-1">Last 1000 records</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Last 24h
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{stats.last24h}</div>
            <p className="text-xs text-gray-500 mt-1">Recent activity</p>
          </CardContent>
        </Card>
      </div>

      {/* Scan Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle>System-Wide Scan Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">
                {stats.validScans}
              </div>
              <div>
                <div className="font-semibold text-green-700">Valid Scans</div>
                <div className="text-xs text-gray-600">Authentic products</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold">
                {stats.duplicateScans}
              </div>
              <div>
                <div className="font-semibold text-yellow-700">Duplicates</div>
                <div className="text-xs text-gray-600">Re-scanned codes</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                {stats.expiredScans}
              </div>
              <div>
                <div className="font-semibold text-orange-700">Expired</div>
                <div className="text-xs text-gray-600">Past expiry date</div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
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

      {/* Companies List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" /> Registered Companies ({companies.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((company) => (
              <div key={company.id} className="p-4 border rounded-lg hover:border-orange-500 transition hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-semibold text-[#0052CC] text-lg">{company.company_name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      ID: {company.id.substring(0, 8)}...
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Registered: {new Date(company.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge className="bg-green-500 text-white">Active</Badge>
                </div>
              </div>
            ))}
            {companies.length === 0 && (
              <div className="col-span-3 text-center py-12 text-gray-500">
                No companies registered yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
