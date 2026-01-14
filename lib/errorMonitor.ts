// Error monitoring and logging utility
import * as Sentry from '@sentry/nextjs';

interface LogContext {
  userId?: string;
  companyId?: string;
  action?: string;
  [key: string]: any;
}

class ErrorMonitor {
  private isProduction = process.env.NODE_ENV === 'production';

  logError(error: Error, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const errorData = {
      timestamp,
      message: error.message,
      stack: error.stack,
      ...context,
    };

    // Log to console
    console.error('🔴 ERROR:', errorData);

    // Send to Sentry in all environments
    Sentry.captureException(error, {
      contexts: { custom: context },
      tags: {
        companyId: context?.companyId,
        action: context?.action,
      },
    });

    // Log to database for critical errors
    if (context?.companyId) {
      this.logToDatabase(errorData).catch(console.error);
    }
  }

  logWarning(message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    console.warn('⚠️  WARNING:', { timestamp, message, ...context });
    
    Sentry.captureMessage(message, {
      level: 'warning',
      contexts: { custom: context },
    });
  }

  logInfo(message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    console.log('ℹ️  INFO:', { timestamp, message, ...context });
  }

  private async logToDatabase(errorData: any) {
    try {
      // Optional: Store critical errors in database
      // const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
      // const supabase = getSupabaseAdmin();
      // await supabase.from('error_logs').insert({
      //   error_message: errorData.message,
      //   stack_trace: errorData.stack,
      //   context: JSON.stringify(errorData),
      //   created_at: errorData.timestamp,
      // });
    } catch (err) {
      console.error('Failed to log error to database:', err);
    }
  }
}

export const errorMonitor = new ErrorMonitor();

// API error handler wrapper
export function withErrorHandling<T>(
  handler: (req: Request) => Promise<T>,
  context?: Omit<LogContext, 'userId' | 'companyId'>
) {
  return async (req: Request): Promise<T | Response> => {
    try {
      return await handler(req);
    } catch (error: any) {
      errorMonitor.logError(error, {
        url: req.url,
        method: req.method,
        ...context,
      });
      
      const { NextResponse } = await import('next/server');
      return NextResponse.json(
        { error: error.message || 'Internal server error' },
        { status: 500 }
      ) as any;
    }
  };
}
