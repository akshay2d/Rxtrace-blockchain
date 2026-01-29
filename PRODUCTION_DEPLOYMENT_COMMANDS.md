# Production Deployment Commands

**Date:** January 30, 2026  
**Purpose:** Build and push RxTrace application to production

---

## Step-by-Step Commands

### Step 1: Navigate to Project Directory
```powershell
cd "C:\Users\Thinkpad\Rxtrace blockchain"
```

### Step 2: Check Current Git Status
```powershell
git status
```

### Step 3: Build for Production
```powershell
npm run build
```

**Expected Output:**
- TypeScript compilation
- Next.js build process
- Should complete without errors
- Creates `.next` folder (already in .gitignore)

### Step 4: Check for Build Errors
```powershell
# If build fails, check the error messages
# Common issues:
# - TypeScript errors
# - Missing dependencies
# - Environment variable issues
```

### Step 5: Review Changes Before Committing
```powershell
git status
git diff
```

### Step 6: Add All Changes
```powershell
# Add all modified and new files
git add .

# Or add specific files/directories:
# git add docs/
# git add lib/
# git add app/
# git add supabase/migrations/
# git add package.json
# git add instrumentation.ts
```

### Step 7: Commit Changes
```powershell
git commit -m "Production ready: Complete Phases 1-15 - Observability, Alerting, Tracing, and Production Readiness"
```

**Or with a more detailed message:**
```powershell
git commit -m "Production ready: Complete all 15 phases

- Phase 14: Real-time alerting system (alert rules, multi-channel notifications)
- Phase 15: Distributed tracing with OpenTelemetry
- Production metrics storage (PostgreSQL)
- Audit log archival and retention
- Complete observability integration
- Production readiness documentation
- All admin routes protected and instrumented
- Database migrations for alerting and metrics
- Comprehensive validation and testing"
```

### Step 8: Check Remote Repository
```powershell
git remote -v
```

### Step 9: Push to Git
```powershell
# Push to main/master branch
git push origin main

# Or if your branch is named differently:
# git push origin master
# git push origin develop
```

### Step 10: Verify Push
```powershell
git log --oneline -5
```

---

## Alternative: Push to Specific Branch

If you want to push to a specific branch:

```powershell
# Create and switch to production branch
git checkout -b production-ready

# Or push to existing branch
git checkout production-ready
git push origin production-ready
```

---

## Complete Command Sequence (Copy-Paste Ready)

```powershell
# Navigate to project
cd "C:\Users\Thinkpad\Rxtrace blockchain"

# Build for production
npm run build

# Check status
git status

# Add all changes
git add .

# Commit
git commit -m "Production ready: Complete Phases 1-15 - Observability, Alerting, Tracing, and Production Readiness"

# Push to main
git push origin main
```

---

## Pre-Push Checklist

Before pushing, verify:

- [ ] Build completes successfully (`npm run build`)
- [ ] No TypeScript errors
- [ ] No console errors in build output
- [ ] All new files are added (`git status` shows clean)
- [ ] `.env.local` and sensitive files are NOT committed (check `.gitignore`)
- [ ] `node_modules/` is NOT committed (check `.gitignore`)
- [ ] `.next/` build folder is NOT committed (check `.gitignore`)

---

## If Build Fails

### Check TypeScript Errors
```powershell
npm run lint
```

### Check for Missing Dependencies
```powershell
npm install
```

### Check Environment Variables
```powershell
# Verify .env.local exists (but don't commit it)
# Check that required variables are set
```

---

## Files That Should Be Committed

✅ **Should be committed:**
- `docs/` - All documentation
- `lib/` - All library code
- `app/` - All application code
- `supabase/migrations/` - Database migrations
- `package.json` and `package-lock.json`
- `tsconfig.json`
- `instrumentation.ts`
- `scripts/` - Utility scripts
- `README.md`
- `.gitignore`

❌ **Should NOT be committed:**
- `.env.local` or `.env` files
- `node_modules/`
- `.next/` build folder
- `out/` or `dist/` folders
- IDE configuration files (`.vscode/`, `.idea/`)

---

## Troubleshooting

### If "git push" fails with authentication error:
```powershell
# You may need to authenticate
# GitHub: Use Personal Access Token
# Or configure SSH keys
```

### If "git push" fails with "branch is behind":
```powershell
# Pull latest changes first
git pull origin main

# Resolve any conflicts, then push again
git push origin main
```

### If build fails with module not found:
```powershell
# Reinstall dependencies
npm install

# Then rebuild
npm run build
```

---

## Post-Push Verification

After pushing, verify on your Git platform (GitHub/GitLab/etc.):

1. ✅ All files are present
2. ✅ Commit message is clear
3. ✅ No sensitive files (`.env`) are visible
4. ✅ Build artifacts (`.next/`) are not committed

---

## Next Steps After Push

1. **Deploy to Production:**
   - If using Vercel: Auto-deploys on push to main
   - If using other platform: Follow deployment guide

2. **Run Database Migrations:**
   - Execute migrations in Supabase SQL Editor
   - Order: 20260129_* then 20260130_*

3. **Configure Environment Variables:**
   - Set production environment variables
   - Configure alerting (email/Slack)
   - Configure tracing (OpenTelemetry endpoint)

4. **Verify Deployment:**
   - Check `/api/admin/health`
   - Check `/api/admin/metrics`
   - Test alert system

---

**Ready to deploy!** 🚀
