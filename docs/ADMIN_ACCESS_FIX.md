# Fix "Forbidden" on Admin Pages (Users, Remove Discount, etc.)

When you see:
- **Failed to fetch users: Forbidden**
- **Failed to remove: Forbidden** (when removing discount from company)
- Or any **403 Forbidden** on admin dashboard actions

**Cause:** The logged-in user is not marked as an admin. Admin APIs use `requireAdmin()` and return 403 if the user is not an admin.

**Same credentials:** User and admin use the same sign-in page (`/auth/signin`) and the same email/password. Admin is just a flag on your account. After you set `is_admin` in Supabase, you **must sign out and sign in again** so the app sees your admin status.

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

## Verify admin status

If you still see "Admin access required" or "Failed to remove: Forbidden":

1. **While logged in**, open in your browser: **`/api/admin/check`**  
   (e.g. `https://your-app.com/api/admin/check`)
2. The response shows:
   - **`isAdmin: true`** – Server sees you as admin. If remove still fails, try a hard refresh or sign out and sign in again.
   - **`isAdmin: false`** – Server does not see you as admin. Use the **`userId`** from the response in the SQL below (replace `YOUR_USER_ID` with that exact UUID), then **sign out and sign in again**.

```sql
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
WHERE id = 'YOUR_USER_ID';
```

3. After running the SQL, **sign out and sign in again** (required so the session gets the new metadata).

---

## If metadata didn’t work: use admin_users table

The server checks **both** metadata and the **admin_users** table. If you already ran the metadata UPDATE and signed out/in but still see "Admin access required", grant admin via the table (same project as your app):

**1. In Supabase SQL Editor, run this** (replace `YOUR_USER_ID` with your UID from Authentication → Users, e.g. `ab400114-93db-43ea-b943-116a3f67425b`):

```sql
-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Grant your user admin (use your UID)
INSERT INTO admin_users (user_id, is_active)
VALUES ('YOUR_USER_ID', true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true;
```

**2. Sign out and sign in again** in the app, then try the admin action (update/remove discount) or open `/api/admin/check`.

**Optional: verify metadata in DB**  
To confirm whether `is_admin` is in the database for your user, run:

```sql
SELECT id, email, raw_user_meta_data
FROM auth.users
WHERE id = 'YOUR_USER_ID';
```

Check that `raw_user_meta_data` contains `"is_admin": true`. If not, run the metadata UPDATE again and ensure you’re in the **same Supabase project** your app uses.

---

## After the fix

- **Users** page should load without "Failed to fetch users: Forbidden".
- **Remove discount** (and other company discount actions) should work without "Failed to remove: Forbidden".
- All other admin routes that use `requireAdmin()` will allow your user.

If you still see 403, confirm you are signed in as the same user you updated and that you refreshed or re-signed-in after changing metadata or `admin_users`.
