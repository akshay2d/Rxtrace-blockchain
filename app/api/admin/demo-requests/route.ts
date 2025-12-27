import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { prisma } from '@/app/lib/prisma';

async function ensureDemoRequestsTable() {
  await prisma.$executeRawUnsafe(`create extension if not exists pgcrypto;`);
  await prisma.$executeRawUnsafe(`
    create table if not exists public.demo_requests (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      company_name text not null,
      email text not null,
      phone text not null,
      message text null,
      source text not null default 'landing',
      ip text null,
      user_agent text null,
      created_at timestamptz not null default now()
    );
  `);
}

function getSupabaseFromRequest(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // No-op for API read; we just need to read the session.
        },
      },
    }
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(request);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 100, 1), 500) : 100;

    await ensureDemoRequestsTable();

    const rows = await prisma.$queryRawUnsafe(
      `select id, name, company_name, email, phone, message, source, ip, user_agent, created_at
       from public.demo_requests
       order by created_at desc
       limit $1`,
      limit
    );

    return NextResponse.json({ success: true, rows });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to load demo requests' },
      { status: 500 }
    );
  }
}
