// app/api/debug/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!url || !key) {
      return NextResponse.json({ 
        error: 'Missing environment variables',
        hasUrl: !!process.env.SUPABASE_URL,
        hasPublicUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_KEY,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      }, { status: 500 });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Test connection by checking tables
    const { data: codesData, error: codesError } = await supabase
      .from('codes')
      .select('*')
      .limit(1);

    const { data: printersData, error: printersError } = await supabase
      .from('printers')
      .select('*')
      .limit(1);

    return NextResponse.json({
      success: true,
      environment: {
        hasUrl: !!url,
        hasKey: !!key,
        urlPrefix: url?.substring(0, 20) + '...'
      },
      tables: {
        codes: {
          accessible: !codesError,
          error: codesError?.message,
          sampleCount: codesData?.length || 0
        },
        printers: {
          accessible: !printersError,
          error: printersError?.message,
          sampleCount: printersData?.length || 0
        }
      }
    });
  } catch (err: any) {
    return NextResponse.json({ 
      error: err?.message || 'Unknown error',
      stack: err?.stack
    }, { status: 500 });
  }
}
