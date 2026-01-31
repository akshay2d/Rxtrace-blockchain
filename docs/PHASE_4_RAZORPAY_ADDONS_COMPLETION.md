# Phase 4: Razorpay Integration (Discount + Tax via Addons) — COMPLETED

**Date:** Jan 2026  
**Scope:** Apply backend-calculated discount and tax in Razorpay via subscription addons.

## What Was Done

### 1. Upgrade API (`app/api/billing/subscription/upgrade/route.ts`)

- **Base price:** Fetched from `subscription_plans` by plan name + `billing_cycle` (monthly/yearly). Plan name normalized from request (e.g. `starter` → `Starter`).
- **GST:** Read from `companies.gst` (included in company select).
- **Final amount:** Uses `calculateFinalAmount()` from `lib/billing/tax` (base → discount → tax).
- **Addons sent to Razorpay:**
  - **Discount:** One addon with negative amount (paise) when company has a subscription discount. Name includes type (e.g. "Discount (10%)" or "Discount (₹500)").
  - **Tax:** One addon with positive amount (paise) when company has GST. Name: "GST (18%)".
- **New subscriptions:** `razorpay.subscriptions.create(…, addons, notes)` with `billing_cycle`, `has_discount`, `has_tax` in notes.
- **Existing subscription updates:** Notes updated with `billing_cycle`, `has_discount`, `has_tax` (addons not re-applied on update; only on create).
- **Billing cycle:** `normalizeCycleForDb()` maps request `billing_cycle` to DB `monthly`/`yearly` for plan lookup.

### 2. Behaviour Summary

- Pricing page sends `plan` + `billing_cycle` (monthly/yearly).
- Backend resolves Razorpay plan ID from env (e.g. `RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL`).
- Base price comes from DB; discount and GST from company; final amount = base − discount + tax (when GST present).
- Razorpay subscription is created with plan (base amount) plus addons for discount (negative) and/or tax (positive).

### 3. Razorpay Limitation

- If Razorpay does **not** allow negative addon amounts, subscription create may fail when a discount addon is sent. In that case you would need to switch to Orders API or another approach (see implementation plan fallback).

## Next Phase

Phase 5 (Discount application) is covered by this implementation. Phase 6: Invoice generation update (store tax, discount, billing_cycle in invoices and PDF).
