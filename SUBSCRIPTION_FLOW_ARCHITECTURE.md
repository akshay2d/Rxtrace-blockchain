# Subscription Flow Architecture

## Overview

This document describes the complete subscription management system for RxTrace, including state transitions, API endpoints, webhook handling, and user-facing flows.

## Table of Contents

1. [Subscription States](#subscription-states)
2. [State Transitions](#state-transitions)
3. [API Endpoints](#api-endpoints)
4. [Webhook Events](#webhook-events)
5. [Database Schema](#database-schema)
6. [User Flow](#user-flow)
7. [Error Handling](#error-handling)
8. [Testing](#testing)

---

## Subscription States

| State | Description | Features |
|-------|-------------|----------|
| `TRIAL` | Trial period (no payment required) | Basic code generation, limited quotas |
| `trialing` | Alternative trial state | Same as TRIAL |
| `PENDING` | Payment pending, awaiting confirmation | View subscription details only |
| `ACTIVE` | Fully active subscription | Full feature access |
| `PAUSED` | Temporarily paused | View details, resume option |
| `CANCELLED` | Cancelled (at period end or immediate) | Limited access until period end |
| `EXPIRED` | Trial or subscription expired | No access, can start new |

---

## State Transitions

### Valid Transitions

```
TRIAL     ─────► ACTIVE    (Trial converted to paid)
TRIAL     ─────► PENDING   (Upgrade initiated)
TRIAL     ─────► EXPIRED  (Trial ended without upgrade)
trialing  ─────► ACTIVE   (Trial converted to paid)
trialing  ─────► PENDING  (Upgrade initiated)
trialing  ─────► EXPIRED (Trial ended without upgrade)
PENDING   ─────► ACTIVE   (Payment confirmed)
PENDING   ─────► CANCELLED(Payment failed/cancelled)
PENDING   ─────► EXPIRED (Payment pending expired)
ACTIVE    ─────► PAUSED  (Subscription paused)
ACTIVE    ─────► CANCELLED(Subscription cancelled)
ACTIVE    ─────► EXPIRED (Subscription expired)
PAUSED    ─────► ACTIVE  (Subscription resumed)
PAUSED    ─────► CANCELLED(Paused subscription cancelled)
CANCELLED ─────► ACTIVE  (Subscription reactivated)
CANCELLED ─────► PENDING (New subscription started)
EXPIRED   ─────► ACTIVE  (New subscription purchased)
EXPIRED   ─────► PENDING (New subscription started)
EXPIRED   ─────► TRIAL  (New trial started)
```

### Invalid Transitions

The following transitions are not allowed:
- `PENDING` → `PAUSED` (Cannot pause pending subscription)
- `EXPIRED` → `PAUSED` (Cannot pause expired subscription)
- `CANCELLED` → `PAUSED` (Cannot pause cancelled subscription)

---

## API Endpoints

### User Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user/subscription` | Get current subscription status |
| POST | `/api/billing/subscription/upgrade` | Upgrade subscription plan |
| POST | `/api/billing/subscription/downgrade` | Downgrade subscription plan |
| POST | `/api/billing/subscription/pause` | Pause subscription |
| POST | `/api/billing/subscription/resume` | Resume paused subscription |
| POST | `/api/billing/subscription/cancel` | Cancel subscription |
| POST | `/api/billing/portal` | Create billing portal session |

### Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/razorpay/webhook` | Handle Razorpay webhooks |

---

## Webhook Events

### Supported Event Types

| Event | Source | Action |
|-------|--------|--------|
| `invoice.paid` | Razorpay | Create billing invoice record |
| `subscription.activated` | Razorpay | Update subscription status to ACTIVE |
| `subscription.cancelled` | Razorpay | Update subscription status to CANCELLED |
| `subscription.paused` | Razorpay | Update subscription status to PAUSED |
| `payment.captured` | Razorpay | Activate PENDING subscriptions |
| `order.paid` | Razorpay | Activate PENDING subscriptions |

### PENDING → ACTIVE Flow

When a payment is captured:

1. Webhook receives `payment.captured` or `order.paid` event
2. System searches for subscription with:
   - `status = 'PENDING'`
   - `pending_payment_id` matches the payment ID
3. If found:
   - Update status to `'ACTIVE'`
   - Set `subscription_activated_at` to current timestamp
   - Clear `pending_payment_id`
   - Write audit log

---

## Database Schema

### Tables

#### `company_subscriptions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `company_id` | UUID | Foreign key to companies |
| `plan_id` | UUID | Foreign key to subscription_plans |
| `plan_code` | String | Human-readable plan code |
| `billing_cycle` | String | 'monthly', 'yearly', 'quarterly' |
| `status` | enum | TRIAL, PENDING, ACTIVE, PAUSED, CANCELLED, EXPIRED |
| `razorpay_subscription_id` | String | Razorpay subscription ID |
| `pending_payment_id` | String | Pending payment ID (PENDING state) |
| `subscription_created_at` | timestamptz | When subscription created |
| `subscription_activated_at` | timestamptz | When subscription activated |
| `current_period_end` | timestamptz | End of billing period |
| `is_trial` | boolean | Whether trial subscription |

#### `subscription_plans`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | String | Plan name (e.g., "Starter Monthly") |
| `billing_cycle` | String | Billing frequency |
| `base_price` | Number | Base price in INR |
| `razorpay_plan_id` | String | Razorpay plan ID |

---

## User Flow

### New Subscription

1. User selects plan on `/pricing`
2. User clicks "Subscribe"
3. System creates Razorpay subscription with status `PENDING`
4. User redirected to Razorpay checkout
5. After payment, webhook activates subscription
6. User has full access

### Upgrade

1. User clicks "Upgrade" on billing page
2. System creates new Razorpay subscription (PENDING)
3. User redirected to payment
4. After payment, old subscription cancelled, new activated

### Pause/Resume

1. User clicks "Pause" on billing page
2. System updates status to `PAUSED`
3. Features disabled
4. User can resume anytime
5. After resume, status back to `ACTIVE`

### Cancel

1. User clicks "Cancel" on billing page
2. User chooses: cancel now or at period end
3. Status updated to `CANCELLED`
4. Access continues until period end (if at_period_end)

---

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| "Subscription not found" | No subscription record | Check company has subscription |
| "Razorpay subscription not found" | Missing Razorpay ID | Contact support |
| "Invalid transition" | Invalid state change | Check state machine rules |
| "Payment failed" | Payment declined | User updates payment method |

### Retry Logic

- Webhook retries: Razorpay retries failed webhooks automatically
- Database retries: 3 attempts with exponential backoff
- Payment retries: Handled by Razorpay checkout

---

## Testing

### Unit Tests

Run: `npm test -- subscription`

Tests cover:
- State machine transitions
- Transition validation
- Feature availability per state
- Color/badge assignments

### Integration Tests

Run: `npm test -- webhook`

Tests cover:
- Webhook event processing
- PENDING → ACTIVE activation
- Invoice creation
- Error handling

### E2E Tests

Run: `npm run test:e2e`

Tests cover:
- Complete subscription flow
- Payment processing
- Webhook handling
- Feature access control

---

## Environment Variables

```env
# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PLAN_STARTER_MONTHLY=
RAZORPAY_PLAN_STARTER_YEARLY=
RAZORPAY_PLAN_GROWTH_MONTHLY=
RAZORPAY_PLAN_GROWTH_YEARLY=

# Email
RESEND_API_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=

# App
NEXT_PUBLIC_APP_URL=
```

---

## Monitoring

### Health Checks

- `/api/razorpay/webhook/health` - Webhook endpoint health
- `/api/health` - General API health

### Metrics

Webhook processing statistics available at:
- `/api/razorpay/webhook/stats`

---

## Support

For issues or questions:
- Internal: Check logs in `/api/razorpay/webhook`
- External: Contact support@rxtrace.in
