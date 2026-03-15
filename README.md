# RxTrace India - Pharmaceutical Traceability Platform

This branch is configured for **trial-only entitlement**.

## Development Requirements
- Node.js 20 LTS is required.
- Run `nvm use` before starting the project.

## Features
- GS1 label generation (Unit/Box/Carton/Pallet)
- Dashboard and analytics
- Team and admin operations
- Trial activation / trial expiration enforcement

## Environment
Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (only for internal non-billing cron tasks)

## Notes
- Paid subscription billing/payment gateway logic is intentionally removed from this branch.
- Backup subscription implementation is maintained separately in `subscription-generation`.
