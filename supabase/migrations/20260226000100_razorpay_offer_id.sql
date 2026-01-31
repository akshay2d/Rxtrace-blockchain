-- Blocker 2: Store Razorpay offer IDs for discount/coupon so payment gateway applies discount (offer_id).
-- Discount authority: gateway applies discount via offer_id; internal math must not decide final amount.

-- discounts: map coupon to Razorpay offer (one offer per subscription)
ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS razorpay_offer_id TEXT;

COMMENT ON COLUMN discounts.razorpay_offer_id IS 'Razorpay offer ID for this discount; used when creating subscription so gateway applies discount.';

-- companies: optional company-level discount → Razorpay offer (when admin assigns discount)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS razorpay_offer_id TEXT;

COMMENT ON COLUMN companies.razorpay_offer_id IS 'Razorpay offer ID for company-level subscription discount; used when creating subscription.';
