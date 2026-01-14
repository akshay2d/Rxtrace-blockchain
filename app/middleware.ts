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

  // Exempt /api/auth/* and /api/setup/* from all auth checks
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/api/setup')) {
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

  // If user is authenticated and accessing dashboard (except setup-company page), check for company
  if (session && pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/setup-company')) {
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', session.user.id)
      .single();

    if (!company) {
      return NextResponse.redirect(new URL('/dashboard/setup-company', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/dashboard/:path*', '/regulator/:path*', '/api/:path*'],
};