// Re-export runtime config from webhook route
export const runtime = 'nodejs' as const;
export const dynamic = 'force-dynamic' as const;
export const revalidate = 0;

export { POST } from '@/app/api/razorpay/webhook/route';
