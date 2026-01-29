# PHASE-6: Destructive Admin Actions – Confirmation & Audit (Phase 2 Continuation)

**Status: COMPLETED** (Jan 2026)

## Completed in this phase

- **`/api/admin/users`** – DELETE: `requireAdmin`, USER_DELETE confirmation (body: `user_id`, `confirmation_token`), `logAdminAction` on success/failure.
- **`/api/admin/discounts/assign`** – DELETE: confirmation (query: `company_id`, `discount_id`, `confirmation_token`), DISCOUNT_REMOVE, `logAdminAction`.

## Objective

Extend the Phase 2 two-step confirmation flow and `logAdminAction` audit logging to **all remaining** destructive admin routes, so every high-impact admin action requires explicit confirmation and is fully audited.

## Background

Phase 2 implemented:
- Confirmation system (`lib/auth/confirmation.ts`): `generateConfirmationToken`, `verifyConfirmationToken`, `requiresConfirmation(action)`
- Audit logging (`lib/audit/admin.ts`): `logAdminAction`
- UI: `AdminConfirmDialog`, `useDestructiveAction`
- Routes already done: `/api/admin/freeze` (POST), `/api/admin/companies/discount` (DELETE with query `confirmation_token`)

Phase 2 “Remaining Admin Routes to Update” listed:
- discounts/assign (DELETE)
- users (DELETE)
- refunds (all methods)
- credit-notes (all methods)
- subscription-plans (DELETE if exists)
- company-subscriptions (DELETE/CANCEL)
- Any other destructive operations

## Scope (in scope)

- Add **confirmation + audit** to each destructive handler in the table below, using the same pattern as freeze and company discount.
- Ensure each handler: (1) calls `requireAdmin()`, (2) if action is in `CONFIRMATION_REQUIRED_ACTIONS`, first request without `confirmation_token` returns `requires_confirmation` + token, (3) second request with valid `confirmation_token` performs the action and calls `logAdminAction` with success/failure.

## Out of scope

- New confirmation action types beyond those already in `CONFIRMATION_REQUIRED_ACTIONS`.
- Changing non-destructive handler logic.
- UI for every route (admin UIs can adopt `AdminConfirmDialog` + `useDestructiveAction` as they are updated).

## Implementation pattern

Same as Phase 2 (see `app/api/admin/freeze/route.ts` and `app/api/admin/companies/discount/route.ts`):

1. `requireAdmin()` → get `userId`.
2. Parse `confirmation_token` from body or query (DELETE often uses query).
3. If `requiresConfirmation(action)` and no token → return `{ requires_confirmation: true, confirmation_token }`.
4. If token present → `verifyConfirmationToken(token, userId, action)`; invalid → 400.
5. Perform the destructive operation.
6. On success/failure → `logAdminAction({ action, resourceType, resourceId, companyId?, oldValue, newValue, status, requiresConfirmation, confirmationToken? })`.

Actions already in `CONFIRMATION_REQUIRED_ACTIONS`: `USER_DELETE`, `REFUND_PROCESS`, `CREDIT_NOTE_CREATE`, `DISCOUNT_DELETE`, `DISCOUNT_REMOVE`, `SUBSCRIPTION_CANCEL`, `SUBSCRIPTION_DELETE`, …

## Routes to update

| Route | Destructive method(s) | Action constant | Status |
|-------|------------------------|-----------------|--------|
| `users/route.ts` | DELETE | USER_DELETE | ✅ Done |
| `discounts/assign/route.ts` | DELETE | DISCOUNT_REMOVE | ✅ Done |
| `discounts/route.ts` | DELETE | DISCOUNT_DELETE | ✅ Done |
| `refunds/route.ts` | POST (process refund) | REFUND_PROCESS | ✅ Done |
| `credit-notes/route.ts` | POST (create) | CREDIT_NOTE_CREATE | ✅ Done |
| `subscription-plans/route.ts` | DELETE | (add if needed) | ✅ N/A (no DELETE method exists) |
| `company-subscriptions/route.ts` | PUT (cancel) | SUBSCRIPTION_CANCEL | ✅ Done |
| `bulk-upload/route.ts` | POST | BULK_UPLOAD (logAdminAction only, no confirmation) | ✅ Done |

## Files touched

- `app/api/admin/users/route.ts` – DELETE: requireAdmin, USER_DELETE confirmation, logAdminAction.
- `app/api/admin/discounts/assign/route.ts` – DELETE: confirmation + audit.
- `app/api/admin/discounts/route.ts` – DELETE: confirmation + audit.
- `app/api/admin/refunds/route.ts` – POST: REFUND_PROCESS confirmation + audit.
- `app/api/admin/credit-notes/route.ts` – POST: CREDIT_NOTE_CREATE confirmation + audit.
- `app/api/admin/subscription-plans/route.ts` – DELETE (if exists): confirmation + audit.
- `app/api/admin/company-subscriptions/route.ts` – cancel/delete: confirmation + audit.
- `app/api/admin/bulk-upload/route.ts` – optional: add logAdminAction for audit trail.
- `docs/PHASE6_IMPLEMENTATION.md` – this document.

## Testing

1. Call each destructive endpoint **without** `confirmation_token` → must return `requires_confirmation: true` and `confirmation_token` when the action is in `CONFIRMATION_REQUIRED_ACTIONS`.
2. Call again **with** that `confirmation_token` (body or query as per route) → action runs and audit log written.
3. Invalid/expired token → 400, no state change.
