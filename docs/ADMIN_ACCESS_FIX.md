# Fix "Forbidden" on Admin Pages (Users, Remove Discount, etc.)

When you see:
- **Failed to fetch users: Forbidden**
- **Failed to remove: Forbidden** (when removing discount from company)
- Or any **403 Forbidden** on admin dashboard actions

**Cause:** The logged-in user is not marked as an admin. Admin APIs use `requireAdmin()` and return 403 if the user is not an admin.

---

## How admin is checked

The app treats a user as admin if **either** of these is true:

1. **Supabase Auth:** `auth.users.user_metadata.is_admin === true`
2. **admin_users table (if it exists):** A row with `user_id` = your user ID and `is_active = true`

---

## Fix: Grant yourself admin access

### Option A: Supabase Dashboard (recommended)

1. Open **Supabase Dashboard** → your project.
2. Go to **Authentication** → **Users**.
3. Find your user (by email) and open it.
4. Click **Edit user** (or the three dots → Edit).
5. In **User Metadata** (or **Raw User Meta Data**), add:
   ```json
   { "is_admin": true }
   ```
   If there is already metadata, merge this in, e.g.:
   ```json
   { "is_admin": true, "other_key": "other_value" }
   ```
6. Save.

Then sign out and sign in again (or refresh the session) so the app sees the updated metadata. After that, **Users** and **Remove discount** (and other admin actions) should work.

---

### Option B: SQL in Supabase (user_metadata)

1. Supabase Dashboard → **SQL Editor**.
2. Get your user ID: **Authentication** → **Users** → copy the **UUID** of your user.
3. Run (replace `YOUR_USER_ID` with that UUID):

```sql
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
WHERE id = 'YOUR_USER_ID';
```

4. Sign out and sign in again in the app.

---

### Option C: Use admin_users table

If you prefer to use a table instead of metadata:

1. Create the table and add your user (run in Supabase **SQL Editor**).
2. Replace `YOUR_USER_ID` with your auth user UUID from **Authentication** → **Users**.

```sql
-- Create admin_users if it doesn't exist
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Grant your user admin (replace YOUR_USER_ID with your auth.users id)
INSERT INTO admin_users (user_id, is_active)
VALUES ('YOUR_USER_ID', true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;
```

3. Sign out and sign in again.

---

## After the fix

- **Users** page should load without "Failed to fetch users: Forbidden".
- **Remove discount** (and other company discount actions) should work without "Failed to remove: Forbidden".
- All other admin routes that use `requireAdmin()` will allow your user.

If you still see 403, confirm you are signed in as the same user you updated and that you refreshed or re-signed-in after changing metadata or `admin_users`.
