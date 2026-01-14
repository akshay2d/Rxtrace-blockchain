# Billing Setup (Invoices + Auto-billing)

This project includes:
- Invoices table migration
- Invoice APIs
- A secured cron endpoint that generates invoices and charges after trial end

## 1) Apply the invoices migration in Supabase

1. Open Supabase Dashboard → **SQL Editor**.
2. Open the migration file in your repo:
   - app/migrations/20260103_add_billing_invoices.sql
3. Copy/paste the SQL into Supabase SQL Editor and click **Run**.

Expected result:
- A new table `billing_invoices` exists in `public` schema.

## 2) Configure CRON_SECRET

Set an environment variable:
- `CRON_SECRET` = a long random string

This secret is required to call the cron endpoint.

## 3) Create a scheduled job to call the billing runner

The billing runner is:
- `POST /api/cron/billing/run`
- Header: `x-cron-secret: <CRON_SECRET>`

### Option A (recommended): External cron / uptime monitor

Use any scheduler that can do an HTTP POST with headers (Pipedream, GitHub Actions, cron-job.org, server cron, etc.).

Schedule suggestion:
- Run **daily** (e.g., 02:00 IST). The endpoint is idempotent per company+period.

### Option B: Supabase Scheduled Triggers

If you use Supabase Scheduled Triggers, configure it to call your deployed URL:
- `https://<your-domain>/api/cron/billing/run`
- Method: `POST`
- Header: `x-cron-secret: <CRON_SECRET>`

(Exact UI names can vary depending on Supabase version.)

## 4) Manual test (local)

1. Start the app: `npm run dev`
2. Ensure `.env.local` contains `CRON_SECRET`.
3. Run:
   - `npm run billing:cron`

This runs `scripts/test-billing-cron.ps1` and reads `CRON_SECRET` from your environment.

To test against a different base URL:
- `npm run billing:cron -- -BaseUrl https://your-domain.com`

You should receive JSON output with `{ ok: true, processed: <n> }`.

## Notes / current billing logic

- The cron endpoint finds companies with `subscription_status='trial'` and `trial_end_date <= now`, generates an invoice, and charges the wallet using `wallet_update_and_record`.
- The invoice is idempotent per `(company_id, period_start)`.
