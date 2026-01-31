# Phase 10: Billing Monitoring & Alerting

**Objective:** Ensure billing-critical routes and events are monitored and can trigger alerts when they fail or degrade.

**Dependencies:** Phases 0–9 (billing fix, E2E testing, production readiness) complete.

---

## 1. Billing-critical routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/razorpay/webhook` | POST | Razorpay events (subscription, invoice, payment) – **critical** |
| `/api/billing/subscription/upgrade` | POST | Create/upgrade subscription |
| `/api/billing/calculate-amount` | POST | Subscription amount preview (Phase 7) |
| `/api/billing/calculate-cart-amount` | POST | Cart amount preview |
| `/api/addons/cart/create-order` | POST | Add-on cart checkout |
| `/api/addons/activate` | POST | Add-on activation after payment |
| `/api/billing/invoices` | GET | List invoices |
| `/api/billing/health` | GET | Billing readiness (admin) |

---

## 2. What to monitor

- **Webhook:** Error rate, latency, success. Failures cause invoices/subscription state to drift from Razorpay.
- **Subscription upgrade:** Error rate, latency. Failures block users from upgrading.
- **Add-on cart / activate:** Error rate. Failures block add-on purchases.
- **Billing health:** `GET /api/billing/health` – `billing_ready` and checks (keys, plan env vars, `subscription_plans` DB). Include in periodic health or dashboard.

---

## 3. Suggested alert rules

Alert rules use `alert_rules` (metric_type, threshold_type, threshold_value, route_pattern, severity). Create rules via admin API or DB.

### Webhook (critical)

- **Name:** `billing_razorpay_webhook_error_rate`
- **Description:** Razorpay webhook error rate – invoice/subscription sync depends on this.
- **metric_type:** `error_rate`
- **threshold_type:** `greater_than`
- **threshold_value:** `0.1` (10%)
- **route_pattern:** `/api/razorpay/webhook` (or `.*razorpay.*webhook.*` if route format differs)
- **method:** `POST`
- **severity:** `critical`
- **cooldown_minutes:** 15
- **channels:** Email/Slack as configured

### Subscription upgrade (warning)

- **Name:** `billing_subscription_upgrade_error_rate`
- **Description:** Subscription upgrade API error rate.
- **metric_type:** `error_rate`
- **threshold_type:** `greater_than`
- **threshold_value:** `0.2` (20%)
- **route_pattern:** `/api/billing/subscription/upgrade`
- **method:** `POST`
- **severity:** `warning`
- **cooldown_minutes:** 30

### Billing routes (optional)

- **Name:** `billing_addon_cart_error_rate`
- **metric_type:** `error_rate`
- **threshold_type:** `greater_than`
- **threshold_value:** `0.2`
- **route_pattern:** `/api/addons/cart/create-order`
- **severity:** `warning`

---

## 4. Security events (webhook failures)

The Razorpay webhook handler logs **security_events** on:

- **Invalid signature** – `verifyRazorpayWebhookSignatureEnhanced` fails.
- **Webhook processing failed** – `webhook_processing_failed` (e.g. invoice creation throws).

Review `security_events` (or audit logs) for `action = 'webhook_processing_failed'` and `action = 'webhook_invoice_creation_unauthorized'` to detect billing incidents. If your alerting supports log-based or custom metrics, add rules that fire when these actions appear.

---

## 5. Billing health in monitoring

- **Periodic check:** Call `GET /api/billing/health` (as admin) on a schedule (e.g. every 5–15 min). If `billing_ready === false`, trigger an alert or ticket.
- **Deployment:** After deploy, run billing health as part of post-deploy checks (see Phase 9).

---

## 6. Metrics and dashboards

If you use a metrics store (e.g. route_metrics, operation_metrics):

- **Routes:** Filter by route containing `billing`, `razorpay`, `addons/cart`, `addons/activate` to build a billing dashboard.
- **Key metrics:** Request count, error count, latency (p50/p95) for the routes in §1.

---

## 7. Runbook links

- **Webhook failures:** See Phase 9 runbook – “Subscription created but invoice not created”, “Wrong amount”.
- **Billing health degraded:** Check env (Razorpay keys, plan IDs), DB (`subscription_plans`), Phase 9 checklist.

---

## 8. Phase 10 checklist

- [ ] At least one alert rule for Razorpay webhook (error_rate, critical).
- [ ] Optional alert rules for subscription upgrade and add-on cart.
- [ ] Billing health (`GET /api/billing/health`) included in monitoring or post-deploy checks.
- [ ] Team knows where to see security_events / audit logs for `webhook_processing_failed`.
- [ ] Runbook (Phase 9) linked from alert runbooks or playbooks.
