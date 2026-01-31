-- Add coupon support to addon_carts for checkout discount
ALTER TABLE IF EXISTS public.addon_carts
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.discounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_paise INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.addon_carts.coupon_id IS 'Applied coupon (discount) id when user enters code at checkout';
COMMENT ON COLUMN public.addon_carts.discount_paise IS 'Discount amount in paise applied from coupon';
