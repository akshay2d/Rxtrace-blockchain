# Vercel Environment Variables Checklist

## ✅ Copy ALL these to Vercel → Settings → Environment Variables

### CRITICAL - Supabase
```
NEXT_PUBLIC_SUPABASE_URL=https://qogfckcwlnrppbvwjsvg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvZ2Zja2N3bG5ycHBidndqc3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5NDk0NzEsImV4cCI6MjA3OTUyNTQ3MX0.af8RxY8ZY1OemXXdTuVcQCuC4NECu47bF0m4vB3fl5U
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvZ2Zja2N3bG5ycHBidndqc3ZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mzk0OTQ3MSwiZXhwIjoyMDc5NTI1NDcxfQ.6mbufJy1Hc_M_36aWMz1Oxnjn64yymsD9-tkhXgrxRc
```

### CRITICAL - Razorpay
```
RAZORPAY_KEY_ID=rzp_live_S2zN6DKJuWue1Q
RAZORPAY_KEY_SECRET=3ukxQjiXXDrkqK15A6Knw6G3
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_S2zN6DKJuWue1Q
RAZORPAY_WEBHOOK_SECRET=rxtrace_rzp_wh_9F3mK7Q2X8L1PZC5A6YH0D4
```

### CRITICAL - Razorpay Plan IDs (REQUIRED FOR TRIAL ACTIVATION)
**⚠️ THIS IS WHY TRIAL ACTIVATION IS FAILING**
```
RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY=plan_S2rKoluhdlJFuD
RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL=plan_S3l4FjVmX5MeDq
RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY=plan_S3kg2PFlTxAQbl
RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL=plan_S3l6rzZbd1kjFz
RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY=plan_S3kmA2Eue9TFfc
RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY=plan_S3lIcx2wN74mVM
```

### CRITICAL - Application URLs
```
NEXT_PUBLIC_APP_URL=https://rxtrace.in
NEXT_PUBLIC_BASE_URL=https://rxtrace.in
```

### CRITICAL - Email Service
```
RESEND_API_KEY=re_YpvFo7ts_FFrbqeVTeyRwXRJfYSuJDfXw
RESEND_FROM=RxTrace India <noreply@rxtrace.in>
```

### CRITICAL - SMTP Backup
```
SMTP_HOST=smtp.zoho.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=admin@rxtrace.in
SMTP_PASSWORD=123Akshay@1980
EMAIL_FROM=noreply@rxtrace.in
```

### CRITICAL - Zoho Books
```
ZOHO_BOOKS_ORGANIZATION_ID=910290769
ZOHO_CLIENT_ID=1000.CQWGZSVTM26IJVSC51X13OXUZUIAZG
ZOHO_CLIENT_SECRET=1a9a1be8ae1663ef23fd1533c8e611d77e154f24d6
ZOHO_REFRESH_TOKEN=1000.fbe7af2acebbe79ce455d78a7a7983ca.fbc34b5e5d7c1f33793f22598b0acb75
ZOHO_ACCOUNTS_DOMAIN=https://accounts.zoho.in
ZOHO_API_DOMAIN=https://www.zohoapis.in
```

### CRITICAL - Cron
```
CRON_SECRET=IQhv52DIqkntMG66Oo3WHJiSfMbCuDJjNzOW8uhMWrc=
```

### Optional - Database
```
DATABASE_URL=postgresql://postgres:Akshay%401980%24@db.qogfckcwlnrppbvwjsvg.supabase.co:5432/postgres
```

---

## 🔴 THE MAIN PROBLEM

**Trial activation is failing because Razorpay subscription plan IDs are missing in Vercel.**

When code tries to create a subscription after payment (line 36 in `/api/trial/activate/route.ts`), it throws:
```
Error: Missing Razorpay plan id env for starter
```

## ✅ FIX STEPS

1. Go to **Vercel Dashboard**
2. Select your project → **Settings** → **Environment Variables**
3. **Copy-paste ALL variables above**
4. Select **Production, Preview, Development** for each
5. Click **Save**
6. Go to **Deployments** → Click **"Redeploy"** on latest deployment

**After redeployment, trial activation will work.**
