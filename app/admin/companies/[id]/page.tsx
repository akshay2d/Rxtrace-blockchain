'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabaseClient } from '@/lib/supabase/client';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, TrendingUp, Users, FileText } from 'lucide-react';
import { UsageMeter } from '@/components/usage/UsageMeter';

type Company = {
  id: string;
  company_name: string;
  created_at: string;
};

type UsageData = {
  current_period: {
    usage: Record<string, any>;
  };
  seats: {
    max_seats: number;
    used_seats: number;
    available_seats: number;
    seats_from_plan: number;
    seats_from_addons: number;
  };
  historical: Array<{
    metric_type: string;
    period_start: string;
    used_quantity: number;
  }>;
};

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  
  const [company, setCompany] = useState<Company | null>(null);
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [companyId]);

  async function fetchData() {
    setLoading(true);
    try {
      const supabase = supabaseClient();
      
      // Fetch company
      const { data: companyData } = await supabase
        .from('companies')
        .select('id, company_name, created_at')
        .eq('id', companyId)
        .single();

      if (companyData) {
        setCompany(companyData);
      }

      // Fetch usage data
      const usageRes = await fetch(`/api/admin/companies/${companyId}/usage`);
      const usageBody = await usageRes.json();
      if (usageBody.success) {
        setUsageData(usageBody);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading && !company) {
    return <div className="p-6">Loading...</div>;
  }

  if (!company) {
    return <div className="p-6">Company not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/companies')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{company.company_name}</h1>
            <p className="text-gray-600 text-sm mt-1">Company ID: {company.id.substring(0, 8)}...</p>
          </div>
        </div>
        <Button onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usage">
            <TrendingUp className="w-4 h-4 mr-2" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="seats">
            <Users className="w-4 h-4 mr-2" />
            Seats
          </TabsTrigger>
          <TabsTrigger value="subscription">
            <FileText className="w-4 h-4 mr-2" />
            Subscription
          </TabsTrigger>
        </TabsList>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Period Usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {usageData?.current_period?.usage && Object.keys(usageData.current_period.usage).length > 0 ? (
                Object.entries(usageData.current_period.usage).map(([metricType, data]: [string, any]) => (
                  <UsageMeter
                    key={metricType}
                    label={metricType}
                    used={data.used}
                    limit={data.limit_value}
                    limitType={data.limit_type}
                    exceeded={data.exceeded}
                  />
                ))
              ) : (
                <p className="text-gray-500 text-sm">No usage data available</p>
              )}
            </CardContent>
          </Card>

          {/* Historical Usage */}
          {usageData?.historical && usageData.historical.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Historical Usage (Last 6 Months)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {usageData.historical.map((entry, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 border rounded">
                      <div>
                        <span className="font-semibold">{entry.metric_type}</span>
                        <span className="text-sm text-gray-600 ml-2">
                          {new Date(entry.period_start).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <Badge>{entry.used_quantity.toLocaleString('en-IN')}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Seats Tab */}
        <TabsContent value="seats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Seat Information</CardTitle>
            </CardHeader>
            <CardContent>
              {usageData?.seats ? (
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-sm text-gray-600 mb-1">Total Allowed</div>
                    <div className="text-2xl font-bold text-blue-700">{usageData.seats.max_seats}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {usageData.seats.seats_from_plan} from plan + {usageData.seats.seats_from_addons} from add-ons
                    </div>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-sm text-gray-600 mb-1">Used Seats</div>
                    <div className="text-2xl font-bold text-green-700">{usageData.seats.used_seats}</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-sm text-gray-600 mb-1">Available Seats</div>
                    <div className="text-2xl font-bold text-gray-700">{usageData.seats.available_seats}</div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No seat data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Subscription History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500 text-sm">Subscription history will be displayed here</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => router.push(`/admin/companies/${companyId}/audit`)}
              >
                View Audit Logs
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
