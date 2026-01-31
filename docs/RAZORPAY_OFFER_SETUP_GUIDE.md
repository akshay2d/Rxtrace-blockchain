# Razorpay Offer Setup Guide

This guide explains how to link **coupons** and **company internal discounts** to Razorpay so the discount actually applies at checkout.

---

## Prerequisite: Create the offer in Razorpay

Razorpay does not let you create offers via API. You must create them in the **Razorpay Dashboard**.

1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Go to **Subscriptions** → **Offers** (or equivalent for your account).
3. Create an offer that matches your discount (e.g. 10% off, or ₹500 off).
4. Copy the **Offer ID** (e.g. `offer_xxxxxxxxxxxx`). You will paste this in RxTrace admin.

---

## Flow 1: Coupon (code at checkout)

**When to use:** You want users to enter a **coupon code** (e.g. SUMMER20) at checkout to get a discount.

### Step-by-step

1. **Create the offer in Razorpay** (see above). Copy the Offer ID.

2. **In RxTrace Admin:**
   - Go to **Admin** → **Discounts & Coupons**.
   - Click **New Discount** (or **Edit** an existing one).
   - Fill in:
     - **Discount Code** (e.g. SUMMER20)
     - **Type** (Percentage or Flat)
     - **Value** (e.g. 20 or 500)
     - **Valid From / Valid To** (optional)
     - **Usage Limit** (optional)
     - **Razorpay Offer ID** ← Paste the Offer ID from step 1 (e.g. `offer_xxxx`).
   - Save.

3. **Assign the coupon to companies:**
   - On the same page, click **Assign** on the discount card.
   - Select the company(ies) that are allowed to use this code.
   - Save.

4. **At checkout:**
   - User from an assigned company goes to Pricing → selects plan → enters the coupon code (e.g. SUMMER20).
   - RxTrace validates the coupon and sends the linked **Razorpay Offer ID** to Razorpay.
   - Razorpay applies the discount; user pays the discounted amount.

**Summary:** Coupon is created in Admin → Discounts; you add the Razorpay Offer ID there and assign the coupon to companies. That links the coupon to Razorpay.

---

## Flow 2: Company internal discount (no code)

**When to use:** You want a **specific company** to always get a discount when they subscribe, **without** entering any coupon code (e.g. enterprise deal, loyalty discount).

### Step-by-step

1. **Create the offer in Razorpay** (see above). Copy the Offer ID.  
   (Use an offer that matches the discount you will set: e.g. 15% off or ₹1000 off.)

2. **In RxTrace Admin:**
   - Go to **Admin** → **Companies**.
   - Open the **company** that should get the internal discount.
   - Open the **Discounts** tab.

3. **Set the company discount:**
   - **Discount Type:** Percentage or Flat.
   - **Discount Value:** e.g. 15 or 1000.
   - **Applies To:** Subscription only / Add-ons only / Both (choose as needed).
   - **Razorpay Offer ID:** Paste the Offer ID from step 1 (e.g. `offer_xxxx`).
   - (Optional) **Notes:** e.g. "Enterprise deal", "Loyalty discount".
   - Click **Set Discount** or **Update Discount**.

4. **At checkout:**
   - User from that company goes to Pricing → selects plan. They do **not** need to enter a coupon.
   - RxTrace uses the company’s discount for the preview and sends the company’s **Razorpay Offer ID** to Razorpay.
   - Razorpay applies the offer; user pays the discounted amount.

**Summary:** Company internal discount is set in Admin → Companies → [Company] → Discounts. You add the Razorpay Offer ID there. That links the company’s subscription discount to Razorpay (no coupon code).

---

## Quick comparison

| | **Coupon** | **Company internal discount** |
|--|--|--|
| **Admin path** | Discounts & Coupons | Companies → [Company] → Discounts |
| **User action** | Must enter coupon code at checkout | No code; automatic for that company |
| **Razorpay Offer ID** | Set on the coupon (discount) form | Set on the company discount form |
| **Typical use** | Promo codes (SUMMER20, WELCOME10) | Per-company deals (enterprise, loyalty) |

---

## If you use both (coupon + company discount)

- If the user **enters a valid coupon**, RxTrace uses that coupon’s Offer ID (coupon wins).
- If the user **does not** enter a coupon but the company has an internal discount, RxTrace uses the company’s Offer ID.

Only **one** offer is sent to Razorpay per subscription (Razorpay accepts a single `offer_id` per subscription).
