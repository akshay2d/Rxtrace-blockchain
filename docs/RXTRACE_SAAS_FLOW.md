# RxTrace SaaS Flow

## Perfect flow for SaaS RxTrace project

---

## 1. First-time user journey

1. **Signup** → Email, password, name
2. **OTP** → Verify email via OTP
3. **Company Setup** → Complete company profile (required)
4. **Dashboard** → User lands on dashboard

---

## 2. Dashboard (primary hub)

| User state | What they see |
|------------|---------------|
| **No trial, no subscription** | "Start 15-Day Free Trial" + "Subscribe to Plan" buttons |
| **Trial active** | Trial status (days left) + "Upgrade Plan" + "Manage Trial" (→ Settings) |
| **Paid subscription** | "Active subscription" + "Billing" link |

- **Start Trial** → Calls `/api/trial/activate` (no payment)
- **Subscribe / Upgrade** → Goes to Pricing page (Razorpay payment)
- **Manage Trial** → Goes to Settings (cancel, resume)
- **Billing** → Goes to Billing page (invoices, subscription details, usage)

---

## 3. Settings (trial management only)

- **Trial active** → Cancel Trial, Upgrade Plan
- **Trial/Subscription CANCELLED or PAUSED** → Resume, Upgrade Plan
- **Paid subscription** → Go to Billing
- **No trial** → Go to Dashboard (to start trial or subscribe)

---

## 4. Pricing (subscription only)

- Plan selection, Razorpay checkout
- No trial content
- Coupon code for discounts
- Add-on cart

---

## 5. Billing (billing purpose only)

- **Subscription details** → Plan, status, period end
- **Usage & Cost Breakdown** → Usage by code type, quotas (unchanged)
- **Invoices** → Download PDFs
- **Add-ons** → Purchased add-ons
- **Actions** → Cancel subscription, Resume subscription, Change/Upgrade plan (→ Pricing)

---

## 6. Page responsibilities summary

| Page | Responsibility |
|------|----------------|
| **Dashboard** | Start trial, Upgrade button, trial status, Billing link, indicative cost, KPIs |
| **Settings** | Trial cancel/resume, company profile, user profile |
| **Pricing** | Subscription plans, payment, add-ons |
| **Billing** | Invoices, subscription details, usage quotas, cancel/resume paid subscription |

---

## 7. Trial vs subscription (separate)

| Action | Trial | Subscription |
|--------|-------|--------------|
| Start/Activate | Dashboard → `/api/trial/activate` | Pricing → `/api/billing/subscription/upgrade` |
| Cancel | Settings → `/api/trial/cancel` | Billing → `/api/billing/subscription/cancel` |
| Resume | Settings → `/api/trial/resume` or billing resume | Billing → `/api/billing/subscription/resume` |

---

## 8. Usage quota

- **Dashboard** → Usage & Limits (meters), Cost Usage Distribution (indicative cost)
- **Billing** → Usage & Cost Breakdown (tables) for paid subscriptions – **unchanged**
