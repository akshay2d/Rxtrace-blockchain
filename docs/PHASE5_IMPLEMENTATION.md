# PHASE-5: Admin Route Protection Completion

**Status: COMPLETED** (Jan 2025)

## Objective

Add `requireAdmin()` to every admin API route that does not yet enforce it, so all `/api/admin/*` endpoints are consistently restricted to admin users (Phase 1 continuation).

## Scope

- **In scope**: All admin route handlers under `app/api/admin/**/route.ts` that lack a `requireAdmin()` check at the start of each HTTP method handler (GET, POST, PUT, DELETE, etc.).
- **Already protected** (from Phase 1 / Phase 4): `companies/discount`, `discounts/assign`, `freeze`, `users`, `subscription-plans`, `bulk-upload`.

## Out of scope

- Changing handler logic other than adding the admin check.
- `seat-limits`: May remain company-scoped for non-admin callers; document or add admin-only usage as needed.

## Implementation

For each remaining route, at the top of every exported handler:

```ts
import { requireAdmin } from "@/lib/auth/admin";

export async function GET(req: Request) {
  const { error: adminError } = await requireAdmin();
  if (adminError) return adminError;
  // ... existing logic
}
```

## Routes updated (all done)

| Route | Handlers protected |
|-------|--------------------|
| `add-ons/route.ts` | GET, POST, PUT |
| `analytics/overview/route.ts` | GET |
| `analytics/revenue/route.ts` | GET |
| `analytics/subscriptions/route.ts` | GET |
| `analytics/usage/route.ts` | GET |
| `analytics/export/revenue/route.ts` | GET |
| `analytics/export/subscriptions/route.ts` | GET |
| `analytics/export/usage/route.ts` | GET |
| `companies/[id]/usage/route.ts` | GET |
| `company-subscriptions/route.ts` | GET, POST, PUT |
| `credit-notes/route.ts` | GET, POST |
| `demo-requests/route.ts` | GET |
| `discounts/route.ts` | GET, POST, DELETE |
| `fix-missing-subscriptions/route.ts` | POST |
| `handset-tokens/route.ts` | GET |
| `handsets/route.ts` | GET |
| `handsets/high-scan/route.ts` | GET |
| `heads/toggle/route.ts` | POST |
| `invite-user/route.ts` | POST |
| `pallet/route.ts` | GET |
| `refunds/route.ts` | GET, POST |
| `scan-history/route.ts` | GET |
| `scanner-settings/route.ts` | GET, POST |
| `seat-limits/route.ts` | **Company-scoped** – used by billing/team UI for own company; no requireAdmin (see Out of scope). |
| `seats/route.ts` | **Company-scoped** – used by team page for own company; no requireAdmin (see Out of scope). |
| `subscription-plans/route.ts` | GET, POST, PUT |

## Files touched

- Each `app/api/admin/**/route.ts` listed above.
- `docs/PHASE5_IMPLEMENTATION.md` (this document).
