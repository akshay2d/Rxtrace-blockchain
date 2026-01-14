# Production Deployment - Action Items

## ✅ Completed (Development)
- [x] Fixed all critical bugs
- [x] Email invitation system implemented
- [x] Admin authorization added
- [x] Sentry monitoring configured
- [x] RLS migration created
- [x] Documentation written
- [x] Verification scripts created

---

## 📋 TODO: Configuration (2-3 hours)

### 1. Supabase RLS Setup
**Time: 15 minutes**
- [ ] Log into Supabase Dashboard
- [ ] Go to SQL Editor
- [ ] Open file: `supabase/migrations/20260115_enable_rls_production.sql`
- [ ] Copy entire content
- [ ] Paste in SQL Editor
- [ ] Click **RUN**
- [ ] Verify success (should see "Success. No rows returned")
- [ ] Run verification query:
  ```sql
  SELECT tablename, rowsecurity 
  FROM pg_tables 
  WHERE schemaname='public' AND rowsecurity=true;
  ```
- [ ] Should return 10+ tables with RLS enabled

**Verification:** All tables show `rowsecurity: true`

---

### 2. Razorpay Live Configuration
**Time: 30 minutes**

#### Switch to Live Mode
- [ ] Log into Razorpay Dashboard
- [ ] Click **Live Mode** toggle (top-right)
- [ ] Go to **Settings** → **API Keys**
- [ ] Generate new live key pair (if not done)
- [ ] Copy **Key ID** (starts with `rzp_live_`)
- [ ] Copy **Key Secret**
- [ ] Save securely (will add to Vercel later)

#### Create Subscription Plans
Create these 6 plans in **Settings** → **Subscriptions**:

- [ ] **Starter Monthly**
  - Name: RxTrace Starter Monthly
  - Amount: ₹18,000
  - Interval: Monthly (1 month)
  - Copy Plan ID → Save as `RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY`

- [ ] **Starter Annual**
  - Name: RxTrace Starter Annual
  - Amount: ₹2,00,000
  - Interval: Yearly (12 months)
  - Copy Plan ID → Save as `RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL`

- [ ] **Growth Monthly**
  - Name: RxTrace Growth Monthly
  - Amount: ₹49,000
  - Interval: Monthly (1 month)
  - Copy Plan ID → Save as `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY`

- [ ] **Growth Annual**
  - Name: RxTrace Growth Annual
  - Amount: ₹5,00,000
  - Interval: Yearly (12 months)
  - Copy Plan ID → Save as `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL`

- [ ] **Enterprise Monthly**
  - Name: RxTrace Enterprise Monthly
  - Amount: ₹2,00,000
  - Interval: Monthly (1 month)
  - Copy Plan ID → Save as `RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY`

- [ ] **Enterprise Quarterly**
  - Name: RxTrace Enterprise Quarterly
  - Amount: ₹5,00,000
  - Interval: Quarterly (3 months)
  - Copy Plan ID → Save as `RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY`

#### Configure Webhook
- [ ] Go to **Settings** → **Webhooks** (Live Mode)
- [ ] Click **+ Create New Webhook**
- [ ] URL: `https://yourdomain.com/api/webhooks/razorpay` (will update after deploy)
- [ ] Secret: Generate strong random string (save securely)
- [ ] Events: Select **ALL** subscription and payment events:
  - [ ] subscription.charged
  - [ ] subscription.activated
  - [ ] subscription.cancelled
  - [ ] subscription.paused
  - [ ] subscription.resumed
  - [ ] payment.failed
  - [ ] payment.captured
- [ ] Save webhook
- [ ] Copy **Webhook Secret** → Save as `RAZORPAY_WEBHOOK_SECRET`

**Verification:** You should have 6 plan IDs + webhook secret saved

---

### 3. SMTP Email Configuration
**Time: 15 minutes**

Choose **ONE** option:

#### Option A: Gmail (Recommended for testing)
- [ ] Go to Google Account: https://myaccount.google.com/
- [ ] Enable **2-Step Verification** (Security → 2-Step Verification)
- [ ] Generate **App Password**:
  - Go to: https://myaccount.google.com/apppasswords
  - Select "Mail" and your device
  - Click "Generate"
  - Copy 16-character password
- [ ] Save credentials:
  ```
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=your-email@gmail.com
  SMTP_PASSWORD=16-char-app-password
  SMTP_FROM="RxTrace India <noreply@yourdomain.com>"
  ```

#### Option B: SendGrid (Recommended for production)
- [ ] Sign up at https://sendgrid.com/ (free tier: 100 emails/day)
- [ ] Verify email address
- [ ] Create API Key (Settings → API Keys)
- [ ] Copy API key
- [ ] Save credentials:
  ```
  SMTP_HOST=smtp.sendgrid.net
  SMTP_PORT=587
  SMTP_USER=apikey
  SMTP_PASSWORD=your-sendgrid-api-key
  SMTP_FROM="RxTrace India <noreply@yourdomain.com>"
  ```

**Verification:** Test email locally (Step 4)

---

### 4. Local Testing
**Time: 30 minutes**

- [ ] Add SMTP credentials to `.env.local`
- [ ] Start dev server: `npm run dev`
- [ ] Test Sentry: Visit `http://localhost:3000/sentry-example-page`
  - [ ] Should see error logged in Sentry Dashboard
- [ ] Test email invitation:
  - [ ] Go to dashboard/team
  - [ ] Click "Invite User"
  - [ ] Enter email and role
  - [ ] Click Send
  - [ ] Check email received (check spam folder)
- [ ] Test dashboard stats:
  - [ ] Go to `/dashboard`
  - [ ] Verify stats load (no errors)
  - [ ] Check plan type shows correctly
- [ ] Test seat limits:
  - [ ] Go to `/dashboard/team`
  - [ ] Verify seat count shows correctly
  - [ ] Verify "Available seats" displays
- [ ] Generate labels:
  - [ ] Generate Unit label
  - [ ] Generate Box label
  - [ ] Download PDF
  - [ ] Verify QR codes scan correctly

**Verification:** All features work locally with no errors

---

### 5. Deploy to Vercel
**Time: 30 minutes**

#### Prepare Code
- [ ] Commit all changes:
  ```bash
  git add .
  git commit -m "Production ready: RLS, Sentry, email configured"
  git push origin main
  ```

#### Import to Vercel
- [ ] Go to https://vercel.com/
- [ ] Click **Add New** → **Project**
- [ ] Import your GitHub repository
- [ ] Framework Preset: **Next.js**
- [ ] Click **Import**

#### Add Environment Variables
Copy from `.env.production.template` and fill in:

**Supabase:**
- [ ] NEXT_PUBLIC_SUPABASE_URL
- [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY
- [ ] SUPABASE_SERVICE_ROLE_KEY

**Razorpay (LIVE KEYS!):**
- [ ] RAZORPAY_KEY_ID
- [ ] RAZORPAY_KEY_SECRET
- [ ] NEXT_PUBLIC_RAZORPAY_KEY_ID
- [ ] RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY
- [ ] RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL
- [ ] RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY
- [ ] RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL
- [ ] RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY
- [ ] RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY
- [ ] RAZORPAY_WEBHOOK_SECRET

**Email:**
- [ ] SMTP_HOST
- [ ] SMTP_PORT
- [ ] SMTP_USER
- [ ] SMTP_PASSWORD
- [ ] SMTP_FROM

**Cron:**
- [ ] CRON_SECRET (generate: `openssl rand -base64 32`)

**Sentry:**
- [ ] SENTRY_DSN (from Sentry Dashboard)
- [ ] NEXT_PUBLIC_SENTRY_DSN (same as above)
- [ ] SENTRY_AUTH_TOKEN (from `.env.sentry-build-plugin`)

**App:**
- [ ] NEXT_PUBLIC_APP_URL (your Vercel domain)
- [ ] NODE_ENV=production

#### Deploy
- [ ] Click **Deploy**
- [ ] Wait for build to complete (3-5 minutes)
- [ ] Copy deployment URL (e.g., `https://rxtrace-india.vercel.app`)

**Verification:** Deployment succeeds without errors

---

### 6. Post-Deployment Configuration
**Time: 30 minutes**

#### Update Razorpay Webhook
- [ ] Go to Razorpay Dashboard → Settings → Webhooks
- [ ] Edit your webhook
- [ ] Update URL to: `https://your-vercel-domain.vercel.app/api/webhooks/razorpay`
- [ ] Save
- [ ] Test webhook delivery (Razorpay provides test button)

#### Set Up Cron Job
Choose **ONE** option:

**Option A: Vercel Cron** (Easiest)
- [ ] Create `vercel.json` in project root:
  ```json
  {
    "crons": [{
      "path": "/api/cron/billing/run",
      "schedule": "0 2 * * *"
    }]
  }
  ```
- [ ] Add `x-cron-secret` header handling to cron route
- [ ] Commit and deploy

**Option B: External Cron** (cron-job.org)
- [ ] Sign up at https://cron-job.org/
- [ ] Create new cron job
- [ ] URL: `https://your-domain.vercel.app/api/cron/billing/run`
- [ ] Method: POST
- [ ] Header: `x-cron-secret: your-cron-secret`
- [ ] Schedule: `0 2 * * *` (daily at 2 AM)
- [ ] Save and enable

#### Run Verification Script
- [ ] Update `PRODUCTION_URL` in script or set env var:
  ```bash
  export NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
  node scripts/verify-deployment.js
  ```
- [ ] All tests should pass

#### Production Testing
- [ ] Sign up with real email on production
- [ ] Verify email received
- [ ] Complete company setup
- [ ] Authorize ₹5 (check Razorpay dashboard)
- [ ] Verify trial starts
- [ ] Generate labels
- [ ] Invite team member
- [ ] Check email received
- [ ] Test seat limits
- [ ] Monitor Sentry dashboard (check for errors)

**Verification:** All production features work correctly

---

## 📊 Final Checklist

### Security
- [ ] All secrets stored in Vercel environment (not in code)
- [ ] `.env.local` and `.env.production` in `.gitignore`
- [ ] RLS enabled on all Supabase tables
- [ ] HTTPS enforced (Vercel does this automatically)
- [ ] Service role key never exposed to client

### Monitoring
- [ ] Sentry receiving errors (test with example page)
- [ ] Razorpay webhooks delivering successfully
- [ ] Cron job scheduled and running
- [ ] Vercel deployment logs accessible

### Documentation
- [ ] Team knows where to find docs (QUICK_START.md)
- [ ] Support contacts saved
- [ ] Rollback plan understood
- [ ] Backup procedures documented

### Communication
- [ ] Stakeholders notified of launch
- [ ] Support email configured
- [ ] User documentation updated
- [ ] Pricing page reflects live plans

---

## 🎉 Launch!

Once all items are checked:
- [ ] Announce launch to users
- [ ] Monitor first 24 hours closely
- [ ] Check Sentry daily for errors
- [ ] Review Razorpay payments
- [ ] Collect user feedback

**Congratulations! Your application is live! 🚀**

---

## 📞 Support

If you encounter issues:
1. Check Vercel deployment logs
2. Check Sentry error dashboard
3. Check Supabase logs
4. Review Razorpay webhook logs
5. Consult PRODUCTION_SETUP.md

**Emergency Rollback:**
Vercel Dashboard → Deployments → Previous → "Promote to Production"
