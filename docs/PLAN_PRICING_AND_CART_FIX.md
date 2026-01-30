# Plan: Fix Pricing Plans & Cart (Wallet Untouched)

**Scope:** Pricing page plan display and add-ons cart only. **Wallet is left unchanged** (no wallet UI or APIs).

---

## 1. Pricing Plan Fix

**Problem**
- Monthly plan can appear twice (one card per DB row; same name = duplicate cards).
- Yearly plan may not show on the same card (or only on a second card) if plan names differ between monthly and yearly rows.

**Goal**
- One card per plan **name** (e.g. one “Starter” card).
- Each card shows: monthly price (once), yearly price (once), and savings when both exist.
- No duplicate cards for the same plan.

**Steps**
1. **Group plans by name**  
   After fetching from `/api/public/plans`, build a structure keyed by `plan.name` (e.g. `Map<string, { monthly?: Plan; yearly?: Plan }>`).
2. **Render one card per plan name**  
   Iterate over unique plan names (or the grouped map). For each name, pick the monthly and yearly plan from the group.
3. **Display logic**  
   - Use monthly plan for “per month” price and plan details (items, etc.).  
   - Use yearly plan for “per year” price and “Save ₹X / year” when both exist.  
   - If only monthly or only yearly exists for a name, show that one only.
4. **IDs and keys**  
   Use a stable key per plan name (e.g. `plan.name` or a slug) for React keys and “Subscribe” so backend receives the correct plan ID (monthly or yearly) for the chosen option.

**Data**
- Ensure `subscription_plans` has consistent **names** for monthly/yearly (e.g. both “Starter”) and correct `billing_cycle` (`monthly` / `yearly`). No schema change required if names already match.

---

## 2. Cart Fix

**Problem**
- Cart does not persist on refresh or navigation (in-memory state only).
- Cart may show “Add Items” or appear empty after adding if add-on keys from API don’t match the keys used in cart state.

**Goal**
- Cart shows added items immediately and stays correct after add/update/remove.
- Optional: persist cart across refresh/navigation (e.g. localStorage or session).

**Steps**
1. **Unify add-on keys**  
   - Use a single function to derive cart key from add-on (e.g. `name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')`).  
   - Use the same key when: adding to cart, reading from cart, matching `addOns` from API in `cartItems` memo, and in checkout payload.  
   - Ensure pricing page uses **API add-ons** (`addOns` from `/api/public/add-ons`) for cart logic, not a different list (e.g. hardcoded ADDONS), so keys always match.
2. **Cart state and display**  
   - When `cart` has entries and keys match `addOns`, `cartItems` will be non-empty and the cart UI will show “In cart: N”, line items, and “Checkout (₹…)” instead of “Add items to cart”.  
   - If “Add Items” still shows after add: verify no re-mount or state reset (e.g. parent key/remount), and that the “Add to cart” / “Update cart” action updates the same `cart` state used by the cart summary.
3. **Persistence (optional)**  
   - If cart should survive refresh/navigation:  
     - Save cart to `localStorage` (e.g. on `cart` change) and restore on load (e.g. in `useEffect` on mount).  
     - Or persist cart per user/session via API and restore after login.  
   - Scope: key by user or anonymous (e.g. `rxtrace_cart` or `rxtrace_cart_{companyId}`).  
   - Validate restored items against current `addOns` (discard unknown keys or outdated add-ons).

**No backend change** required for key alignment or localStorage. If you add server-side cart later, add an endpoint to get/update cart and call it from the same cart state.

---

## 3. Wallet (Out of Scope)

- **No** changes to wallet APIs (`/api/billing/wallet`, `/api/billing/topup`, etc.).
- **No** wallet UI on User Dashboard.
- **No** “Add Money” or wallet top-up flow.
- Current behavior (Razorpay-only billing, wallet removed) remains.

---

## 4. Order of Work

| # | Task                         | Owner / note        |
|---|------------------------------|----------------------|
| 1 | Group plans by name; one card per name; monthly + yearly on same card | Frontend (pricing page) |
| 2 | Unify add-on key derivation; use API add-ons only for cart | Frontend (pricing page) |
| 3 | Verify cart state and UI (“Add Items” vs “Checkout”)  | Test / QA             |
| 4 | (Optional) Add cart persistence (e.g. localStorage)   | Frontend (pricing page) |

---

## 5. Success Criteria

- **Pricing:** One card per plan name; monthly and yearly each shown once per plan; no duplicate “Starter” (or other) cards.
- **Cart:** Adding add-ons shows them in cart immediately; “Checkout (₹…)” appears when cart has items; optional: cart survives refresh.
- **Wallet:** Unchanged; no new wallet features or UI.
