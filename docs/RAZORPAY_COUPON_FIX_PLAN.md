# Plan: Use Razorpay Offer API for Discount/Coupon (Fix Missing Discount in Razorpay)

## Problem (Current State)

1. **Discount not showing in Razorpay:** RxTrace sends discount and coupon as **negative addons** when creating a subscription. Razorpay’s **addons** are for **extra charges** (e.g. “Delivery charges” with positive amount). Negative addons are not supported for discount; Razorpay ignores or mis-handles them, so the final amount in Razorpay does not show the discount.
2. **Coupon not in Razorpay payment:** Coupons are validated only in RxTrace (DB: `discounts`, `company_discounts`). Razorpay never receives a coupon/offer; it only receives `plan_id` and addons. So the amount charged by Razorpay is the **plan amount** (plus any positive addons like GST), not the discounted amount.

## Root Cause

- Razorpay applies discounts via **Offers**, not via addons.
- Create Subscription API accepts **`offer_id`** (string). When you pass `offer_id`, Razorpay applies that offer and the discounted amount appears in checkout, invoices, and payments.
- We are not passing `offer_id`; we are sending discount/coupon as negative addons, which Razorpay does not use for discount.

## Fix Strategy: Use Razorpay `offer_id`

1. **Create offers in Razorpay** (Dashboard only; no Create Offer API).
2. **Map RxTrace coupons/discounts to Razorpay offer IDs** (store `razorpay_offer_id` where needed).
3. **When creating a subscription,** pass **`offer_id`** instead of sending discount/coupon as addons. Send only **GST** (if any) as a positive addon.
4. **Preview and billing** continue to use our calculation for display; the actual charge will match because Razorpay applies the same offer.

---

## Implementation Plan

### Phase 1: Razorpay Dashboard (Manual)

1. In **Razorpay Dashboard** → **Subscriptions** → **Offers** (or Create New Offer):
   - Create one offer per discount type you use, e.g.:
     - 10% off (e.g. `offer_10pct`)
     - 20% off
     - Flat ₹X off (e.g. ₹1000 off)
   - Note the **Offer ID** (e.g. `offer_JHD834hjbxzhd38d`) for each.
2. If you have **company-level discounts** (admin-assigned % or flat), create offers that match those (e.g. “Company 10%”, “Company 20%”) and note their IDs.

### Phase 2: Schema (Minimal)

1. **`discounts` table:** Add column `razorpay_offer_id TEXT` (nullable).  
   - For each coupon code that should apply at checkout, set `razorpay_offer_id` to the Razorpay offer ID that matches that discount (same % or same flat amount).
2. **`companies` table (optional):** Add column `razorpay_offer_id TEXT` (nullable).  
   - When admin assigns a company-level discount, set this to the Razorpay offer ID that matches (e.g. 10% company discount → `offer_10pct`).  
   - Alternatively, use a single config table or env-based mapping (e.g. “10%” → `offer_xxx`) instead of per-company column.

No other schema changes required.

### Phase 3: Subscription Upgrade API (Billing Only)

**File:** `app/api/billing/subscription/upgrade/route.ts`

1. **Resolve `offer_id` for this subscription:**
   - If request has **coupon_code:**  
     Validate coupon (existing logic: `discounts` + `company_discounts`, validity, usage_limit).  
     If valid, read `discounts.razorpay_offer_id`. If not null, use it as `offer_id`.
   - Else if **company** has discount (`discount_type`, `discount_value`) and applies to subscription:  
     Use `companies.razorpay_offer_id` or a mapping (e.g. by discount_type + discount_value) to get Razorpay `offer_id`.
2. **Call Razorpay:**  
   `razorpay.subscriptions.create({ plan_id, total_count, customer_notify, start_at, offer_id: offer_id ?? undefined, addons, notes })`  
   - **Do not** send discount or coupon as negative addons.  
   - **addons:** Only include **GST (18%)** as a positive addon when company has GST (same as now). Remove any addon items that represent “Discount” or “Coupon”.
3. **Existing behaviour to keep:**  
   Plan resolution, company/subscription checks, trial_end_date, notes, and usage_count update for coupon (in `discounts`) stay as today. Only the way we pass discount to Razorpay changes (offer_id instead of addons).

### Phase 4: Calculate-Amount / Preview (Optional Consistency)

**File:** `app/api/billing/calculate-amount/route.ts`

- No change required for correctness.  
- Keep computing preview with company discount + coupon so the “You pay” on the pricing page matches what Razorpay will charge once the same offer is applied via `offer_id`.  
- If you add new coupons later, create a matching offer in Razorpay and set `discounts.razorpay_offer_id` so preview and Razorpay stay in sync.

### Phase 5: Webhook / Billing Page

- **Webhook:** Razorpay will send invoice events with the **discounted** amount (after offer). Existing logic that stores `amount` (and optional breakdown) in `billing_invoices` remains valid; the amount will now be post-discount.
- **Billing page:** Already reads from `billing_invoices`; it will automatically show the correct (discounted) amount. No code change required unless you want to show “Offer/coupon applied” from Razorpay (would require storing offer info from webhook if Razorpay sends it).

### Phase 6: Add-on Cart / Other Billing

- **Scope:** This plan only fixes **subscription** discount/coupon.  
- Add-on cart checkout is separate (orders, not subscriptions). If you want add-on discounts to also use Razorpay, that would be a separate plan (e.g. Payment Links with offer, or order-level discount).  
- No change to add-on flow in this plan.

---

## Summary of Code Touches (Strict Scope)

| Area | Action |
|------|--------|
| **Migration** | Add `razorpay_offer_id` to `discounts`; optionally to `companies` or a small mapping table. |
| **Subscription upgrade** | Resolve `offer_id` from coupon or company discount; pass `offer_id` to Razorpay; remove discount/coupon from addons; keep only GST in addons. |
| **Calculate-amount** | No change (optional: ensure preview logic matches offer behaviour). |
| **Webhook** | No change (amount stored will be discounted). |
| **Billing page** | No change. |
| **Pricing page UI** | No change (coupon input and preview already in place). |

---

## Verification

1. **Subscription with coupon:**  
   User enters valid coupon on pricing → Subscribe.  
   Razorpay checkout and invoice show **discounted** amount; payment is for that amount; billing page shows same amount.

2. **Subscription with company discount (no coupon):**  
   Company has discount assigned; user subscribes without coupon.  
   Razorpay checkout and invoice show discounted amount (via `offer_id` from company/mapping).

3. **Subscription without discount/coupon:**  
   No `offer_id` passed; Razorpay charges full plan amount + GST addon if any. Behaviour unchanged.

---

## Constraints and Notes

- **Razorpay offers are created only in Dashboard** (no Create Offer API). New coupons in RxTrace require creating a matching offer in Razorpay and setting `razorpay_offer_id` on the discount (or mapping).
- **One offer per subscription:** Razorpay accepts a single `offer_id` per subscription. If you need both “company discount” and “coupon”, you must either create a combined offer in Razorpay or apply only one (e.g. coupon takes precedence, or company discount).
- **Tax:** Keep current behaviour: GST calculated in RxTrace and sent as a **positive** addon when company has GST. Do not send discount/coupon as addons.

Once this plan is implemented, discount calculation will appear in Razorpay and coupon-based (and company-level) discounts will be included in the Razorpay payment and billing page.
