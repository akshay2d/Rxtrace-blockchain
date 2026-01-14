import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function keyIdSource(): 'RAZORPAY_KEY_ID' | 'NEXT_PUBLIC_RAZORPAY_KEY_ID' | 'missing' {
  if (process.env.RAZORPAY_KEY_ID) return 'RAZORPAY_KEY_ID';
  if (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) return 'NEXT_PUBLIC_RAZORPAY_KEY_ID';
  return 'missing';
}

function mask(value: string, opts?: { head?: number; tail?: number }): string {
  const head = opts?.head ?? 6;
  const tail = opts?.tail ?? 4;
  if (!value) return '';
  if (value.length <= head + tail) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get('x-cron-secret');
  if (!expected || !provided || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';

  return NextResponse.json({
    configured: Boolean(keyId && keySecret),
    keyIdSource: keyIdSource(),
    keyIdMasked: keyId ? mask(keyId, { head: 10, tail: 4 }) : null,
    keySecretConfigured: Boolean(keySecret),
    keySecretLength: keySecret ? keySecret.length : 0,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
