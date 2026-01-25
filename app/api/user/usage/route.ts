import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUsage, getUsageLimits } from '@/lib/usage/tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: User's company usage
export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: company } = await admin
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!company?.id) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Get current period usage
    const usage = await getCurrentUsage(admin, company.id);
    
    // Get limits
    const limits = await getUsageLimits(admin, company.id);

    // Format usage with limits
    const usageWithLimits: Record<string, any> = {};
    Object.keys(usage).forEach((metricType) => {
      const limit = limits[metricType];
      const used = usage[metricType] || 0;
      const limitValue = limit?.limit_value || null;
      
      usageWithLimits[metricType] = {
        used,
        limit_value: limitValue,
        limit_type: limit?.limit_type || 'NONE',
        exceeded: limitValue ? used > limitValue : false,
        percentage: limitValue ? Math.min(100, Math.round((used / limitValue) * 100)) : 0,
      };
    });

    return NextResponse.json({
      success: true,
      usage: usageWithLimits,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
