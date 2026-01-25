'use client';

import { useEffect, useState } from 'react';
import { supabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Smartphone, AlertCircle } from 'lucide-react';

export default function HandsetsPage() {
  const [companyId, setCompanyId] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCompanyId() {
      try {
        const supabase = supabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setError('Please sign in to view your Company ID');
          setLoading(false);
          return;
        }

        const { data: company, error: companyError } = await supabase
          .from('companies')
          .select('id, company_name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (companyError) {
          throw new Error(companyError.message);
        }

        if (!company) {
          setError('Company not found. Please complete company setup first.');
          setLoading(false);
          return;
        }

        setCompanyId(company.id);
        setCompanyName(company.company_name || '');
      } catch (err: any) {
        setError(err.message || 'Failed to load Company ID');
      } finally {
        setLoading(false);
      }
    }

    loadCompanyId();
  }, []);

  async function copyCompanyId() {
    if (!companyId) return;
    
    try {
      await navigator.clipboard.writeText(companyId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = companyId;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Smartphone className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-semibold">Handset Activation</h1>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            Loading...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Smartphone className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-semibold">Handset Activation</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3 text-red-600">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <div>
                <p className="font-medium">Error</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Smartphone className="h-7 w-7 text-blue-600" />
        <h1 className="text-2xl font-semibold">Handset Activation</h1>
      </div>

      {/* Company ID Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Your Company ID
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {companyName && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Company Name</p>
              <p className="font-semibold text-lg">{companyName}</p>
            </div>
          )}
          
          <div>
            <p className="text-sm text-gray-600 mb-2">Company ID (UUID)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-gray-100 border border-gray-300 px-4 py-3 text-sm font-mono break-all">
                {companyId}
              </code>
              <Button
                onClick={copyCompanyId}
                variant="outline"
                size="sm"
                className="gap-2 shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-medium mb-2">How to activate your handset:</p>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Open the RxTrace Scanner app on your device</li>
              <li>Tap the "Activate" button (🔑) in the top-right corner</li>
              <li>Paste your Company ID in the activation field</li>
              <li>Tap "Activate" to register your device</li>
              <li>Once activated, you'll see "SSCC ready" status</li>
            </ol>
            <p className="text-xs text-blue-700 mt-3">
              <strong>Note:</strong> Unit label scanning works without activation (free). Activation is only required for SSCC (container-level) scanning.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>About Handset Activation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-medium mb-1">Unit Label Scanning (Free)</p>
            <p className="text-gray-600">Works immediately after app installation. No activation needed. Works offline and syncs when online.</p>
          </div>
          <div>
            <p className="font-medium mb-1">SSCC Scanning (Requires Activation)</p>
            <p className="text-gray-600">Container-level codes for boxes, cartons, and pallets. Requires activation with Company ID. Charged per scan based on container type.</p>
          </div>
          <div className="pt-3 border-t">
            <p className="text-gray-600">
              <strong>Need help?</strong> Visit <a href="/dashboard/help" className="text-blue-600 hover:underline">Help & Support</a> for detailed instructions.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
