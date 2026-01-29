# RxTrace India - Pharmaceutical Traceability Platform

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)](https://supabase.com/)
[![Razorpay](https://img.shields.io/badge/Payments-Razorpay-blue)](https://razorpay.com/)

A comprehensive pharmaceutical traceability platform that generates GS1-compliant labels (QR codes, barcodes, DataMatrix) for medicine authentication and tracking. Built specifically for the Indian pharmaceutical industry.

## 🚀 Features

- **GS1-Compliant Label Generation** - QR Code, GS1-128, DataMatrix with proper Application Identifiers
- **Multi-level Packaging** - Unit, Box, Carton, and Pallet (SSCC) label generation
- **Bulk Generation** - CSV upload for mass label creation
- **Mobile Scanner Integration** - Android handset management for verification
- **Subscription Billing** - Razorpay integration with monthly/quarterly/annual plans
- **Team Management** - Multi-user seat-based access control
- **Audit Logging** - Comprehensive tracking of all system events
- **Dashboard Analytics** - Real-time stats and usage tracking

## 📋 Prerequisites

- **Node.js** 18.x or higher
- **npm** or **yarn**
- **Supabase Account** - Free tier works for development
- **Razorpay Account** - For payment processing (TEST mode for development)

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd rxtrace-blockchain
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your credentials in `.env.local`:

```env
# Supabase (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Razorpay (REQUIRED)
RAZORPAY_KEY_ID=rzp_test_xxx  # Use rzp_test_ for development
RAZORPAY_KEY_SECRET=your_secret
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxx

# Subscription Plans (create in Razorpay Dashboard)
RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY=plan_xxx
RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL=plan_xxx
RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY=plan_xxx
RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL=plan_xxx
RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY=plan_xxx
RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY=plan_xxx

# Cron Jobs
CRON_SECRET=$(openssl rand -base64 32)
```

### 4. Database Setup

Run migrations in Supabase SQL Editor (Dashboard → SQL Editor):

```bash
# Copy and execute each migration file from supabase/migrations/ in order:
1. 20251220_fix_skus_table.sql
2. 20260101_create_audit_logs.sql
3. 20260101_setup_flow_schema.sql
4. 20260104_billing_addons_and_quota_enforcement.sql
5. 20260109000100_addon_carts.sql
6. 20260111_zoho_books_integration.sql
7. 20260114_create_seats_table.sql
```

### 5. Razorpay Setup

1. Create subscription plans in [Razorpay Dashboard](https://dashboard.razorpay.com/):
   - **Starter Monthly**: ₹18,000/month
   - **Starter Annual**: ₹2,00,000/year
   - **Growth Monthly**: ₹49,000/month
   - **Growth Annual**: ₹5,00,000/year
   - **Enterprise Monthly**: ₹2,00,000/month
   - **Enterprise Quarterly**: ₹5,00,000/quarter

2. Copy plan IDs to `.env.local`

3. Create webhook endpoint:
   - URL: `https://yourdomain.com/api/webhooks/razorpay`
   - Events: All subscription events
   - Copy webhook secret to `RAZORPAY_WEBHOOK_SECRET`

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📦 Production Deployment

**Status:** ✅ **PRODUCTION READY** - See [Production Readiness Guide](./docs/PRODUCTION_READINESS.md)

### Quick Start

1. **Push to GitHub**
2. **Import in Vercel**
3. **Add Environment Variables** - Copy all from `.env.local`
4. **Run Database Migrations** - See [Deployment Checklist](./docs/DEPLOYMENT_CHECKLIST.md)
5. **Deploy**

### Environment Variables Checklist

#### Core (Required)
```bash
✅ NEXT_PUBLIC_SUPABASE_URL
✅ NEXT_PUBLIC_SUPABASE_ANON_KEY
✅ SUPABASE_SERVICE_ROLE_KEY
✅ RAZORPAY_KEY_ID (use rzp_live_ for production!)
✅ RAZORPAY_KEY_SECRET
✅ NEXT_PUBLIC_RAZORPAY_KEY_ID
✅ RAZORPAY_SUBSCRIPTION_PLAN_ID_* (6 plan IDs)
✅ RAZORPAY_WEBHOOK_SECRET
✅ CRON_SECRET
```

#### Observability (Recommended)
```bash
# Alerting (Phase 14)
✅ ALERTING_ENABLED=true
✅ ALERT_EMAIL_FROM=noreply@yourdomain.com
✅ ALERT_EMAIL_TO=admin@yourdomain.com
✅ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
✅ SLACK_WEBHOOK_URL (optional)

# Distributed Tracing (Phase 15)
✅ OTEL_SERVICE_NAME=rxtrace-admin-api
✅ OTEL_EXPORTER_OTLP_ENDPOINT=https://...
✅ OTEL_EXPORTER_OTLP_HEADERS=...
```

### Database Migrations (Required)

Run these migrations in Supabase SQL Editor **in order**:

1. `20260129_audit_logs_immutability.sql` - Immutable audit logs
2. `20260129_create_metrics_tables.sql` - Metrics storage
3. `20260129_create_audit_logs_archive.sql` - Audit archival
4. `20260130_create_alerting_tables.sql` - Alert system

### Post-Deployment Steps

1. **Update Razorpay Webhook URL** to production domain
2. **Set up Cron Jobs:**
   - **Billing:** Daily at 02:00 IST
     ```bash
     POST https://yourdomain.com/api/cron/billing/run
     Header: x-cron-secret: <CRON_SECRET>
     ```
   - **Alert Evaluation:** Every 5 minutes
     ```bash
     npm run alerts:evaluate
     ```
3. **Create Initial Alert Rules** via `/api/admin/alerts/rules`
4. **Test Payment Flow** with Razorpay test cards
5. **Verify Observability:**
   - Check `/api/admin/health`
   - Check `/api/admin/metrics`
   - Verify traces in observability platform (if configured)
6. **Enable Row Level Security** in Supabase for all tables

### Production Monitoring

- **Health Check:** `/api/admin/health`
- **Metrics:** `/api/admin/metrics`
- **Alerts:** `/api/admin/alerts/history`
- **Stats:** `/api/admin/stats`

See [Production Readiness Guide](./docs/PRODUCTION_READINESS.md) for complete details.

## 🏗️ Project Structure

```
├── app/
│   ├── api/              # API routes
│   │   ├── billing/      # Subscription management
│   │   ├── generate/     # Label generation
│   │   ├── admin/        # Admin endpoints (seats, limits)
│   │   └── cron/         # Automated jobs
│   ├── auth/             # Authentication pages
│   ├── dashboard/        # Protected dashboard
│   └── pricing/          # Public pricing page
├── components/           # React components
│   ├── ui/              # shadcn/ui components
│   └── custom/          # Custom barcode components
├── lib/
│   ├── supabase/        # Supabase clients
│   ├── billing/         # Billing logic
│   └── generateLabel.tsx # Core label generation
├── prisma/
│   └── schema.prisma    # Database schema (for types)
├── supabase/
│   └── migrations/      # SQL migrations
└── scripts/             # Utility scripts
```

## 🔐 Security Considerations

### Before Going Live:

- [ ] Remove test Razorpay keys, use live keys
- [ ] Enable Supabase RLS on all tables
- [ ] Rotate all secrets (CRON_SECRET, webhook secrets)
- [ ] Set up error monitoring (Sentry recommended)
- [ ] Add rate limiting on auth endpoints
- [ ] Enable HTTPS only
- [ ] Configure CORS properly
- [ ] Add CAPTCHA on signup/signin
- [ ] Set up database backups
- [ ] Configure firewall rules

## 📖 Documentation

- [Features Documentation](./FEATURES.md) - Comprehensive feature breakdown
- [Billing Setup](./docs/BILLING_SETUP.md) - Invoice and auto-billing configuration
- [Production Readiness](./docs/PRODUCTION_READINESS.md) - ✅ Production readiness summary and capabilities
- [Deployment Checklist](./docs/DEPLOYMENT_CHECKLIST.md) - Step-by-step deployment guide
- [Copilot Instructions](./.github/copilot-instructions.md) - Development guidelines

### Observability & Monitoring
- [Phase 7: Observability Foundation](./docs/PHASE7_IMPLEMENTATION.md) - Correlation IDs, logging, metrics
- [Phase 12: Production Metrics Storage](./docs/PHASE12_IMPLEMENTATION.md) - Persistent metrics in PostgreSQL
- [Phase 14: Real-Time Alerting](./docs/PHASE14_IMPLEMENTATION.md) - Alert rules and notifications
- [Phase 15: Distributed Tracing](./docs/PHASE15_IMPLEMENTATION.md) - OpenTelemetry integration

## 🧪 Testing

```bash
# Run linter
npm run lint

# Build for production (checks TypeScript)
npm run build

# Test billing cron locally
./scripts/test-billing-cron.ps1
```

## 🐛 Troubleshooting

### "Subscription not found" error
- Check Razorpay plan IDs in `.env.local`
- Verify plan IDs match Razorpay Dashboard

### "Failed to load seat limits" error
- Run: `node scripts/fix-company-plans.js`
- Ensure seats table migration is applied

### Dashboard stats showing 0
- Check if `subscription_plan` is set in companies table
- Verify billing_usage table has entries

### Authentication loops
- Clear cookies
- Check NEXT_PUBLIC_SUPABASE_URL is correct
- Verify middleware.ts matcher patterns

## 📞 Support

For issues or questions, check:
1. [FEATURES.md](./FEATURES.md) for detailed feature explanations
2. Terminal logs for specific error messages
3. Supabase logs in Dashboard → Logs

## 📄 License

Proprietary - All rights reserved

## 🔧 Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Payments**: Razorpay
- **PDF Generation**: @react-pdf/renderer
- **Barcodes**: qrcode, jsbarcode, bwip-js
- **ORM**: Prisma (for types)
- **UI Components**: shadcn/ui

---

Built with ❤️ for the Indian pharmaceutical industry
