# 🚀 Pre-Launch Deployment Checklist

## ✅ Configuration & Security

### Environment Variables
- [ ] Replace all Razorpay TEST keys with LIVE keys
  - `RAZORPAY_KEY_ID=rzp_live_...`
  - `RAZORPAY_KEY_SECRET=...`
  - `NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_...`
- [ ] Generate and set strong `CRON_SECRET` (32+ characters)
- [ ] Set `NEXT_PUBLIC_APP_URL` to production domain
- [ ] Set `NODE_ENV=production`
- [ ] Configure SMTP credentials for email invitations
- [ ] Add Sentry DSN for error monitoring (optional but recommended)

### Supabase Configuration
- [ ] Enable Row Level Security (RLS) on all tables
  - `companies` table
  - `seats` table
  - `billing_usage` table
  - `generated_labels` table
  - `audit_logs` table
  - `scan_logs` table
- [ ] Verify RLS policies are restrictive (user can only see their own company data)
- [ ] Set up database backups (daily recommended)
- [ ] Configure Supabase auth settings:
  - [ ] Email confirmation required
  - [ ] Password minimum length: 8 characters
  - [ ] Enable rate limiting on auth endpoints

### Razorpay Configuration
- [ ] Update webhook URL to production domain:
  `https://yourdomain.com/api/webhooks/razorpay`
- [ ] Verify all 6 subscription plans are created:
  - [ ] Starter Monthly (₹18,000)
  - [ ] Starter Annual (₹2,00,000)
  - [ ] Growth Monthly (₹49,000)
  - [ ] Growth Annual (₹5,00,000)
  - [ ] Enterprise Monthly (₹2,00,000)
  - [ ] Enterprise Quarterly (₹5,00,000)
- [ ] Enable all webhook events in Razorpay Dashboard
- [ ] Copy webhook secret to `RAZORPAY_WEBHOOK_SECRET`
- [ ] Test webhook delivery with Razorpay test events

---

## 🔐 Security Hardening

- [ ] Remove `.env.local` from version control (add to `.gitignore`)
- [ ] Rotate all secrets after deployment
- [ ] Enable HTTPS only (disable HTTP)
- [ ] Configure CORS properly (restrict to your domain)
- [ ] Add rate limiting on:
  - [ ] `/api/auth/*` endpoints
  - [ ] `/api/billing/*` endpoints
  - [ ] `/api/generate/*` endpoints
- [ ] Set up WAF (Web Application Firewall) if using Cloudflare/AWS
- [ ] Add CAPTCHA on signup/signin pages (Google reCAPTCHA recommended)
- [ ] Review and restrict Supabase service role key usage
- [ ] Set up IP whitelist for admin panel (optional)

---

## 📊 Monitoring & Logging

- [ ] Set up error monitoring (Sentry, LogRocket, or similar)
- [ ] Configure uptime monitoring (UptimeRobot, Pingdom, or similar)
  - Monitor: `/`, `/api/health`, `/dashboard`
- [ ] Set up alerts for:
  - [ ] API errors (500 status codes)
  - [ ] Database connection failures
  - [ ] Razorpay webhook failures
  - [ ] High response times (> 3 seconds)
- [ ] Configure log retention policy in Vercel/hosting platform
- [ ] Set up database query performance monitoring

---

## 🔄 Cron Jobs & Automation

- [ ] Set up billing cron job:
  ```bash
  URL: https://yourdomain.com/api/cron/billing/run
  Method: POST
  Header: x-cron-secret: <CRON_SECRET>
  Schedule: Daily at 02:00 IST
  ```
- [ ] Test cron job manually before scheduling
- [ ] Set up backup/monitoring cron (optional):
  - Database export
  - Usage reports
  - Cleanup old logs

---

## 🧪 Testing

### Functional Testing
- [ ] Test complete signup flow (with ₹5 authorization)
- [ ] Verify 15-day trial activation
- [ ] Test label generation (Unit, Box, Carton, Pallet)
- [ ] Test CSV bulk upload
- [ ] Test plan upgrades (Starter → Growth → Enterprise)
- [ ] Test seat invitation and activation
- [ ] Test scanner integration (if handsets available)
- [ ] Test billing cycle transitions (trial → paid)

### Payment Testing
- [ ] Test Razorpay payment with live credit card
- [ ] Verify subscription creation in Razorpay Dashboard
- [ ] Test webhook delivery for:
  - [ ] `subscription.charged`
  - [ ] `subscription.cancelled`
  - [ ] `subscription.paused`
  - [ ] `payment.failed`
- [ ] Verify invoice generation after trial end
- [ ] Test refund flow (if implemented)

### Edge Cases
- [ ] Test with exhausted label quotas
- [ ] Test with expired trial
- [ ] Test with failed payment
- [ ] Test seat limit enforcement
- [ ] Test with slow network (throttle connection)

---

## 📱 Performance Optimization

- [ ] Run Lighthouse audit (target: 90+ performance score)
- [ ] Optimize images (use WebP format)
- [ ] Enable CDN for static assets
- [ ] Set up caching headers
- [ ] Minimize bundle size (check with `npm run build`)
- [ ] Set up database indexes for:
  - [ ] `companies.user_id`
  - [ ] `seats.company_id, seats.status`
  - [ ] `generated_labels.company_id, generated_labels.created_at`
  - [ ] `audit_logs.company_id, audit_logs.created_at`

---

## 📄 Legal & Compliance

- [ ] Add Terms of Service page
- [ ] Add Privacy Policy page
- [ ] Add Refund/Cancellation Policy page
- [ ] Add GST information (if applicable)
- [ ] Display company registration details
- [ ] Add contact information (email, phone)
- [ ] Verify GS1 licensing requirements (if generating real GTINs)

---

## 🚀 Deployment Steps

### 1. Pre-Deployment
```bash
# Test build locally
npm run build
npm run start

# Run linter
npm run lint

# Check TypeScript errors
npx tsc --noEmit
```

### 2. Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### 3. Post-Deployment
- [ ] Verify all pages load correctly
- [ ] Test signup with real email
- [ ] Test payment with live card
- [ ] Check Supabase connection
- [ ] Verify webhook delivery
- [ ] Monitor error logs for 24 hours

---

## 📞 Emergency Contacts & Rollback

### Rollback Plan
If critical issues detected:
1. Revert deployment in Vercel (Deployments → Previous → Promote to Production)
2. Disable webhooks in Razorpay
3. Pause cron jobs
4. Investigate logs and fix issues
5. Re-deploy after testing

### Support Contacts
- Supabase Support: support@supabase.io
- Razorpay Support: https://razorpay.com/support/
- Vercel Support: https://vercel.com/support

---

## ✅ Final Sign-Off

- [ ] Product Owner approval
- [ ] Technical review complete
- [ ] Security audit passed
- [ ] Performance benchmarks met
- [ ] All tests passed
- [ ] Documentation updated
- [ ] Backup and rollback plan ready

**Deployment Date:** ___________________  
**Deployed By:** ___________________  
**Version:** ___________________

---

## 🎉 Post-Launch

- [ ] Monitor error rates (first 24 hours)
- [ ] Check user registrations
- [ ] Verify payment processing
- [ ] Monitor database performance
- [ ] Collect user feedback
- [ ] Plan first patch release (bug fixes)

---

**Note:** This checklist should be completed BEFORE deploying to production. Keep a copy for audit purposes.
