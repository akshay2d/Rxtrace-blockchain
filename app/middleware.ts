// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveCompanyForUser } from '@/lib/company/resolve';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;

  // PHASE-1: Exempt certain routes from all auth checks
  const publicRoutes = [
    '/api/auth',
    '/api/setup',
    '/api/public',
    '/api/health',
    '/pricing',
    '/auth/verify',
    '/auth/callback',
    '/auth/signin',
    '/auth/signup',
    '/',
    '/compliance',
    '/contact',
  ];
  
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
  
  if (isPublicRoute) {
    return supabaseResponse;
  }
  
  // PHASE-1: Protect API routes (except public ones)
  if (pathname.startsWith('/api/')) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    return supabaseResponse;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isProtectedArea =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/regulator');

  if (isProtectedArea && !session) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }

  // Dashboard: canonical company resolver (owner + active seat). No owner-only logic.
  if (session && pathname.startsWith('/dashboard')) {
    if (pathname === '/dashboard/company-setup' || pathname.startsWith('/dashboard/company-setup/')) {
      return supabaseResponse;
    }

    const resolved = await resolveCompanyForUser(
      supabase,
      session.user.id,
      'id, subscription_status, profile_completed'
    );

    if (!resolved) {
      return NextResponse.redirect(new URL('/dashboard/company-setup', request.url));
    }

    const company = resolved.company as Record<string, unknown>;
    if (company.profile_completed === false) {
      if (pathname.startsWith('/dashboard/settings/erp-integration')) {
        return supabaseResponse;
      }
      const companySetupUrl = new URL('/dashboard/company-setup', request.url);
      companySetupUrl.searchParams.set('reason', 'complete_profile');
      return NextResponse.redirect(companySetupUrl);
    }

    // Allow access when: (a) has valid trial/subscription, OR (b) just completed setup (no status yet)
    // User must reach dashboard to start trial (Settings) or subscribe (Pricing)
    const status = String(company.subscription_status ?? '').toLowerCase();
    const allowed = new Set(['trial', 'trialing', 'active', 'paid', 'live']);
    const noStatusYet = status === '' || status === 'null';
    if (!noStatusYet && !allowed.has(status)) {
      return NextResponse.redirect(new URL('/pricing', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/dashboard/:path*', '/regulator/:path*', '/api/:path*', '/pricing', '/auth/callback'],
};