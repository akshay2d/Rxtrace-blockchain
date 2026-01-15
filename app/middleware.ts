// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

  // Exempt /api/auth/*, /api/setup/*, /pricing, /auth/verify, /onboarding, and /auth/callback from all auth checks
  if (pathname.startsWith('/api/auth') || 
      pathname.startsWith('/api/setup') ||
      pathname === '/pricing' ||
      pathname.startsWith('/onboarding') ||
      pathname.startsWith('/auth/verify') ||
      pathname.startsWith('/auth/callback')) {
    return supabaseResponse;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Protect everything under /dashboard and /regulator
  const isProtectedArea =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/regulator');

  if (isProtectedArea && !session) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }

  // If user is authenticated and accessing dashboard, check for company and subscription
  if (session && pathname.startsWith('/dashboard')) {
    const { data: company } = await supabase
      .from('companies')
      .select('id, subscription_status')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!company) {
      return NextResponse.redirect(new URL('/onboarding/setup', request.url));
    }

    if (!company.subscription_status) {
      return NextResponse.redirect(new URL('/pricing', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/dashboard/:path*', '/regulator/:path*', '/onboarding/:path*', '/api/:path*', '/pricing', '/auth/callback'],
};