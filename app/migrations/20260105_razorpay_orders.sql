-- Razorpay orders table for Checkout flows (trial auth + add-ons)

CREATE TABLE IF NOT EXISTS public.razorpay_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL,
  payment_id TEXT,
  amount DECIMAL(10,2) NOT NULL,
  amount_paise INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  receipt TEXT,
  status TEXT,
  purpose TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_razorpay_orders_order_id ON public.razorpay_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_purpose ON public.razorpay_orders(purpose);
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_status ON public.razorpay_orders(status);

ALTER TABLE public.razorpay_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'razorpay_orders'
      AND policyname = 'System can manage orders'
  ) THEN
    CREATE POLICY "System can manage orders"
      ON public.razorpay_orders
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
