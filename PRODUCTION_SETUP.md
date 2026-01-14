# 🚀 Production Deployment Guide

## Step 1: Switch to Live Razorpay Keys

### ⚠️ IMPORTANT: Do this in Vercel/Deployment Environment ONLY

**DO NOT update .env.local with live keys!** Use your deployment platform's environment variables.

### In Razorpay Dashboard:
1. Switch to **Live Mode** (toggle in top-right corner)
2. Go to **Settings** → **API Keys**
3. Generate new live key pair (if not already done)
4. Copy **Key ID** and **Key Secret**

### Live Subscription Plans:
Create these in Razorpay Dashboard (Live Mode):

```bash
Plan Name: RxTrace Starter Monthly
Amount: ₹18,000
Billing Interval: Monthly (1 month)
# Copy plan ID → RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY

Plan Name: RxTrace Starter Annual
Amount: ₹2,00,000
Billing Interval: Yearly (12 months)
# Copy plan ID → RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL

Plan Name: RxTrace Growth Monthly
Amount: ₹49,000
Billing Interval: Monthly (1 month)
# Copy plan ID → RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY

Plan Name: RxTrace Growth Annual
Amount: ₹5,00,000
Billing Interval: Yearly (12 months)
# Copy plan ID → RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL

Plan Name: RxTrace Enterprise Monthly
Amount: ₹2,00,000
Billing Interval: Monthly (1 month)
# Copy plan ID → RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY

Plan Name: RxTrace Enterprise Quarterly
Amount: ₹5,00,000
Billing Interval: Custom (3 months)
# Copy plan ID → RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY
```

### Webhook Configuration:
1. Go to **Settings** → **Webhooks** (Live Mode)
2. Create new webhook:
   - URL: `https://yourdomain.com/api/webhooks/razorpay`
   - Secret: Generate strong random string
   - Events: Select ALL subscription and payment events
3. Save and copy the **Webhook Secret**

---

## Step 2: Enable Supabase RLS

### Apply RLS Migration:
1. Open Supabase Dashboard → **SQL Editor**
2. Open file: `supabase/migrations/20260115_enable_rls_production.sql`
3. Copy entire SQL content
4. Paste in SQL Editor and click **RUN**
5. Verify no errors

### Verification:
```sql
-- Check RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true
ORDER BY tablename;

-- Should return: companies, seats, skus, generation_jobs, 
-- billing_usage, audit_logs, scan_logs, handsets, 
-- razorpay_orders, company_wallets
```

### Test RLS:
1. Try accessing API as authenticated user
2. Verify you can only see your own company data
3. Test with a second user account
4. Confirm they cannot see first user's data

---

## Step 3: Configure SMTP for Emails

### Option A: Gmail (Recommended for small-scale)

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the 16-character password
3. **Add to Environment Variables**:
   ```bash
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-16-char-app-password
   SMTP_FROM="RxTrace India <noreply@yourdomain.com>"
   ```

### Option B: SendGrid (Recommended for production)

1. Sign up at https://sendgrid.com/
2. Create API Key (Settings → API Keys)
3. Use SMTP credentials:
   ```bash
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASSWORD=your-sendgrid-api-key
   SMTP_FROM="RxTrace India <noreply@yourdomain.com>"
   ```

### Option C: AWS SES (Most scalable)

1. Set up AWS SES in your region
2. Verify your domain
3. Get SMTP credentials:
   ```bash
   SMTP_HOST=email-smtp.ap-south-1.amazonaws.com
   SMTP_PORT=587
   SMTP_USER=your-ses-username
   SMTP_PASSWORD=your-ses-password
   SMTP_FROM="RxTrace India <noreply@yourdomain.com>"
   ```

### Test Email:
```bash
# Create test script
node -e "
const nodemailer = require('nodemailer');
const transport = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  auth: { user: 'your@email.com', pass: 'app-password' }
});
transport.sendMail({
  from: 'your@email.com',
  to: 'test@example.com',
  subject: 'RxTrace Test',
  text: 'Email working!'
}).then(() => console.log('✅ Email sent!')).catch(console.error);
"
```

---

## Step 4: Set Up Sentry Monitoring

### Complete Sentry Wizard Setup:
The wizard will create these files:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`

### Get Sentry DSN:
1. Sign up at https://sentry.io/
2. Create new Next.js project
3. Copy DSN from project settings
4. Add to environment variables:
   ```bash
   SENTRY_DSN=your-sentry-dsn
   NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
   SENTRY_AUTH_TOKEN=your-auth-token
   ```

### Configure Error Monitoring:
Update `lib/errorMonitor.ts` to use Sentry:
```typescript
import * as Sentry from '@sentry/nextjs';

// In production, errors will be sent to Sentry
if (this.isProduction && this.sentryDSN) {
  Sentry.captureException(error, { 
    contexts: { custom: context } 
  });
}
```

### Test Sentry:
```bash
# Trigger test error
curl http://localhost:3000/api/test-error
# Check Sentry dashboard for error
```

---

## Step 5: Deploy to Production

### Deploy to Vercel:

#### 1. Push to GitHub:
```bash
git add .
git commit -m "Production ready - RLS, email, monitoring configured"
git push origin main
```

#### 2. Import in Vercel:
- Go to https://vercel.com/
- Click "Add New Project"
- Import your GitHub repository
- Select framework: Next.js

#### 3. Configure Environment Variables:
Add ALL variables from this template:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Razorpay (LIVE KEYS!)
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY=plan_...
RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL=plan_...
RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY=plan_...
RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL=plan_...
RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY=plan_...
RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY=plan_...
RAZORPAY_WEBHOOK_SECRET=...

# Email (Choose your provider)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM="RxTrace India <noreply@yourdomain.com>"

# Cron
CRON_SECRET=your-secure-random-32-char-string

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...

# App
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NODE_ENV=production
```

#### 4. Deploy:
- Click "Deploy"
- Wait for build to complete
- Copy deployment URL

### Post-Deployment Configuration:

#### Update Razorpay Webhook:
1. Razorpay Dashboard → Settings → Webhooks
2. Update URL to: `https://yourdomain.com/api/webhooks/razorpay`
3. Test webhook delivery

#### Set Up Cron Job:
Use Vercel Cron or external service:

**Option A: Vercel Cron** (Add to `vercel.json`):
```json
{
  "crons": [{
    "path": "/api/cron/billing/run",
    "schedule": "0 2 * * *"
  }]
}
```

**Option B: External Cron** (cron-job.org, GitHub Actions):
```bash
curl -X POST https://yourdomain.com/api/cron/billing/run \
  -H "x-cron-secret: your-cron-secret"
```

---

## Step 6: Testing Checklist

### Functional Tests:
- [ ] Sign up with real email
- [ ] Receive verification email
- [ ] Complete company setup
- [ ] Authorize ₹5 payment (will be refunded)
- [ ] Verify 15-day trial starts
- [ ] Generate labels (Unit, Box, Carton, Pallet)
- [ ] Upload CSV bulk generation
- [ ] View dashboard stats
- [ ] Invite team member (check email received)
- [ ] Accept invitation
- [ ] Test seat limits (should enforce max)
- [ ] Test scanner integration (if available)

### Payment Tests:
- [ ] Complete trial period (or manually end trial in Supabase)
- [ ] Verify subscription charged
- [ ] Check invoice in Razorpay
- [ ] Test plan upgrade (Starter → Growth)
- [ ] Test payment failure (use test card that declines)
- [ ] Verify webhook delivery in Razorpay logs

### Security Tests:
- [ ] Try accessing another company's data (should fail)
- [ ] Test RLS: Query Supabase directly as user (should only see own data)
- [ ] Test API rate limiting
- [ ] Check HTTPS is enforced
- [ ] Verify service role key not exposed in client

### Error Monitoring:
- [ ] Trigger test error
- [ ] Check Sentry dashboard
- [ ] Verify error details captured
- [ ] Test email notifications for critical errors

---

## Step 7: Monitoring & Maintenance

### Daily Checks:
- Monitor Sentry for errors
- Check Razorpay webhook logs
- Review cron job execution logs
- Monitor database size

### Weekly Checks:
- Review user signups
- Check payment success rate
- Review audit logs
- Monitor API response times

### Monthly Checks:
- Database backup verification
- Security audit
- Performance optimization
- Update dependencies

---

## Rollback Plan

If issues are detected:

1. **Immediate**: Revert deployment in Vercel
   - Go to Deployments → Previous → "Promote to Production"

2. **Disable Webhooks**: Pause Razorpay webhooks temporarily

3. **Pause Cron**: Disable billing cron job

4. **Investigate**: Check logs in:
   - Vercel deployment logs
   - Sentry error tracking
   - Supabase logs

5. **Fix & Redeploy**: After fixing, repeat deployment steps

---

## Support Contacts

- **Vercel**: https://vercel.com/support
- **Supabase**: support@supabase.io
- **Razorpay**: https://razorpay.com/support/
- **Sentry**: support@sentry.io

---

## ✅ Production Readiness Sign-Off

Before declaring production ready:
- [ ] All environment variables configured
- [ ] RLS enabled and tested
- [ ] Email sending working
- [ ] Error monitoring active
- [ ] Webhooks configured and tested
- [ ] Cron job scheduled
- [ ] All tests passed
- [ ] Backup plan ready
- [ ] Monitoring dashboards set up
- [ ] Team trained on support procedures

**Deployed By:** ___________________  
**Date:** ___________________  
**Version:** ___________________  
**Sign-Off:** ___________________
