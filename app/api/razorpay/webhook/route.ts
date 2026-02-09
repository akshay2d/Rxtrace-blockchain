export const runtime = 'nodejs' as const;
export const dynamic = 'force-dynamic' as const;
export const revalidate = 0;

export { POST, GET } from '@/lib/billing/razorpay-webhook-handler';
