import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // Handle OAuth errors
  if (error) {
    console.error('OAuth callback error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/auth/signin?error=${encodeURIComponent(errorDescription || error)}`, request.url)
    );
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError) {
      console.error('Session exchange error:', sessionError);
      return NextResponse.redirect(
        new URL(`/auth/signin?error=${encodeURIComponent(sessionError.message)}`, request.url)
      );
    }

    if (!data?.session) {
      console.error('No session returned after code exchange');
      return NextResponse.redirect(
        new URL('/auth/signin?error=Authentication failed', request.url)
      );
    }
  }

  // Check if there's a next parameter for redirect
  const nextUrl = requestUrl.searchParams.get('next');
  const redirectTo = nextUrl || '/dashboard/company-setup';
  
  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
