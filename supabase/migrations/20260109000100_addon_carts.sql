-- Add-on carts for multi-item checkout
-- Stores requested add-ons as line items for a single Razorpay order.

CREATE TABLE IF NOT EXISTS public.addon_carts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  user_id UUID,
  order_id TEXT,
  currency TEXT DEFAULT 'INR',
  total_paise INTEGER NOT NULL,
  items JSONB NOT NULL,
  applied_items JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'created',
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addon_carts_company_id ON public.addon_carts(company_id);
CREATE INDEX IF NOT EXISTS idx_addon_carts_order_id ON public.addon_carts(order_id);
CREATE INDEX IF NOT EXISTS idx_addon_carts_status ON public.addon_carts(status);

ALTER TABLE public.addon_carts ENABLE ROW LEVEL SECURITY;

-- Intentionally no permissive RLS policy here.
-- Server-side code uses the Supabase service role (bypasses RLS).
