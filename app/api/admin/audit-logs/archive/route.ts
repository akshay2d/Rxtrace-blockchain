// PHASE-13: Audit Log Archival Endpoint
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getOrGenerateCorrelationId,
  logWithContext,
  measurePerformance,
  recordRouteMetric,
} from "@/lib/observability";
import { logAdminAction } from "@/lib/audit/admin";

export const runtime = "nodejs";

/**
 * POST: Manually trigger audit log archival
 * PHASE-13: Allows admins to manually archive old audit logs
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-13: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/audit-logs/archive',
        method: 'POST',
      });
      recordRouteMetric('/api/admin/audit-logs/archive', 'POST', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const { retention_days } = body;
    
    const retentionDays = retention_days || parseInt(process.env.AUDIT_LOG_ACTIVE_RETENTION_DAYS || '90', 10);
    
    logWithContext('info', 'Admin audit log archival request', {
      correlationId,
      route: '/api/admin/audit-logs/archive',
      method: 'POST',
      userId,
      retentionDays,
    });
    
    // PHASE-13: Measure performance
    const { result: archivalResult, duration } = await measurePerformance(
      'admin.audit-logs.archive',
      async () => {
        // Call archival function
        const { data, error } = await supabase.rpc('archive_old_audit_logs', {
          retention_days: retentionDays,
        });
        
        if (error) throw error;
        
        // The function returns a table, so data is an array
        const result = Array.isArray(data) && data.length > 0 ? data[0] : { archived_count: 0 };
        
        return {
          archivedCount: result.archived_count || 0,
          oldestArchivedDate: result.oldest_archived_date,
          newestArchivedDate: result.newest_archived_date,
        };
      },
      { correlationId, route: '/api/admin/audit-logs/archive', method: 'POST', userId, retentionDays }
    );
    
    // PHASE-13: Log archival action
    await logAdminAction({
      action: 'AUDIT_LOG_ARCHIVAL',
      resourceType: 'audit_log',
      companyId: null,
      newValue: {
        archived_count: archivalResult.archivedCount,
        retention_days: retentionDays,
        oldest_archived_date: archivalResult.oldestArchivedDate,
        newest_archived_date: archivalResult.newestArchivedDate,
      },
      status: 'success',
      metadata: {
        retention_days: retentionDays,
        archived_count: archivalResult.archivedCount,
      },
    });
    
    logWithContext('info', 'Admin audit log archival completed', {
      correlationId,
      route: '/api/admin/audit-logs/archive',
      method: 'POST',
      userId,
      archivedCount: archivalResult.archivedCount,
      duration,
    });
    
    recordRouteMetric('/api/admin/audit-logs/archive', 'POST', true, duration);
    return NextResponse.json({
      success: true,
      message: 'Audit logs archived successfully',
      result: {
        archived_count: archivalResult.archivedCount,
        oldest_archived_date: archivalResult.oldestArchivedDate,
        newest_archived_date: archivalResult.newestArchivedDate,
        retention_days: retentionDays,
      },
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', 'Admin audit log archival failed', {
      correlationId,
      route: '/api/admin/audit-logs/archive',
      method: 'POST',
      userId,
      error: err.message || String(err),
      duration,
    });
    
    recordRouteMetric('/api/admin/audit-logs/archive', 'POST', false, duration);
    
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to archive audit logs' },
      { status: 500 }
    );
  }
}

/**
 * GET: Get archival status and statistics
 * PHASE-13: Returns information about archived logs
 */
export async function GET(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-13: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/audit-logs/archive',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/audit-logs/archive', 'GET', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    
    // PHASE-13: Measure performance
    const { result: stats, duration } = await measurePerformance(
      'admin.audit-logs.archive.stats',
      async () => {
        // Get counts
        const [activeCount, archiveCount] = await Promise.all([
          supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
          supabase.from('audit_logs_archive').select('id', { count: 'exact', head: true }),
        ]);
        
        // Get date ranges
        const [activeRange, archiveRange] = await Promise.all([
          supabase
            .from('audit_logs')
            .select('created_at')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('audit_logs_archive')
            .select('created_at, archived_at')
            .order('archived_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        
        return {
          active: {
            count: activeCount.count || 0,
            oldest: activeRange.data?.created_at || null,
          },
          archived: {
            count: archiveCount.count || 0,
            newest_archived: archiveRange.data?.archived_at || null,
            oldest_log: archiveRange.data?.created_at || null,
          },
        };
      },
      { correlationId, route: '/api/admin/audit-logs/archive', method: 'GET', userId }
    );
    
    logWithContext('info', 'Admin audit log archival stats retrieved', {
      correlationId,
      route: '/api/admin/audit-logs/archive',
      method: 'GET',
      userId,
      duration,
    });
    
    recordRouteMetric('/api/admin/audit-logs/archive', 'GET', true, duration);
    return NextResponse.json({
      success: true,
      stats,
      retention_days: parseInt(process.env.AUDIT_LOG_ACTIVE_RETENTION_DAYS || '90', 10),
      final_retention_years: parseInt(process.env.AUDIT_LOG_ARCHIVE_RETENTION_YEARS || '7', 10),
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', 'Admin audit log archival stats failed', {
      correlationId,
      route: '/api/admin/audit-logs/archive',
      method: 'GET',
      userId,
      error: err.message || String(err),
      duration,
    });
    
    recordRouteMetric('/api/admin/audit-logs/archive', 'GET', false, duration);
    
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to get archival stats' },
      { status: 500 }
    );
  }
}
