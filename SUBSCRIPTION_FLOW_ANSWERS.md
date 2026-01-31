# Subscription & Trial — Quick Answers

## Is the subscription flow established?
**Yes.** Paid subscriptions use plan selection (monthly/annual), billing provider (Razorpay), and `company_subscriptions` with `plan_id` and status `ACTIVE`. Trial uses a separate path with no plan and no payment.

## Are Trial and Subscription separate?
**Yes.** Trial and paid subscription are separate:

- **Trial:** One action ("Start free trial"). No plan chosen, no payment. Creates a row in `company_subscriptions` with `plan_id = NULL`, `status = trialing`, `is_trial = true`, and `trial_end` set. User gets access for the trial period.
- **Paid subscription:** User picks a plan (e.g. Starter monthly/annual) and pays via Razorpay. Creates/updates `company_subscriptions` with `plan_id` set and `status = ACTIVE`. Billing repeats per cycle.

They do not depend on each other: you can start a trial without ever picking a plan, and you can subscribe to a paid plan without having used a trial.

---

## Subscription flow in simple terms

1. **No subscription yet**
   - User can **start a free trial** (no plan, no payment). Access for 15 days.
   - Or user can **choose a plan** (e.g. Starter/Growth/Enterprise, monthly or annual) and **pay**. Access for the billing period, then auto-renewal.

2. **During trial**
   - User has full access. No charge. When trial ends, access stops unless they subscribe to a paid plan.

3. **Paid subscription**
   - User has a plan and is charged each cycle (monthly or annual). They can cancel, pause, or change plan via Billing; access continues until the current period ends (for cancel/pause).

4. **Data**
   - One row per company in `company_subscriptions`. Trial: `plan_id` NULL, `is_trial` true, `status` trialing. Paid: `plan_id` set, `status` ACTIVE (or PAUSED/CANCELLED). Trial does not depend on any plan.
