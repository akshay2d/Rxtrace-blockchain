# RxTrace India - AI Coding Agent Instructions

## Project Overview
RxTrace India is a pharmaceutical traceability platform built with Next.js 14 (App Router), TypeScript, Supabase, and Tailwind CSS. The application generates GS1-compliant labels (QR codes, barcodes, DataMatrix) for medicine authentication and tracks them in a centralized database.

## Architecture & Key Patterns

### Authentication & Data Flow
- **Supabase Auth**: Use `@supabase/ssr` for consistent client/server authentication
  - Client components: `supabaseClient()` from `lib/supabase/client.ts`
  - Server components/API: `supabaseServer()` from `lib/supabase/server.ts`
  - Middleware: Custom `createServerClient` in `app/middleware.ts` for route protection
- **Route Protection**: `app/middleware.ts` protects `/dashboard/*` routes, redirects unauthenticated users to `/auth/signin`
- **Company Association**: Users must have a `companies` table entry (linked by `user_id`) before accessing dashboard features

### Database Schema Pattern
Two core tables track label generation:
- `product_batches`: Stores product metadata (GTIN, batch number, dates, MRP, company info)
- `generated_labels`: Tracks label generation events (type, format, quantity, timestamps)

Both tables require `user_id` and `company_id` foreign keys. Always fetch company data before saving labels.

### Label Generation System (`lib/generateLabel.tsx`)
**Critical**: This file handles barcode/QR generation with dual format support:
- **GS1 Format**: `buildGS1String()` creates compliant data with Application Identifiers: `(01)GTIN(17)EXPIRY(10)BATCH(11)MFG`
- **RxTrace URL Format**: `buildRxTraceURL()` creates verification links: `https://rxtrace.in/verify?gtin=...&lot=...&exp=...`
- **Output Formats**: PDF (multi-code grid layout), PNG, ZPL (Zebra printers), EPL (Eltron printers)

**Functions to use**:
- `generateMultiCodePDF()`: Bulk generation (100 codes per A4 page, 80x80pt each)
- `generatePDF()`: Single label generation
- `generateZPL()` / `generateEPL()`: Printer-specific formats

**Date Format Convention**: Internal storage uses `DD-MM-YYYY`, database uses `YYYY-MM-DD`. Convert using:
```typescript
const [dd, mm, yyyy] = dateString.split('-');
const dbFormat = `${yyyy}-${mm}-${dd}`; // For Supabase
const displayFormat = `${dd}-${mm}-${yyyy}`; // For UI
```

### Component Patterns
- **Custom Barcode Components**: `components/custom/{QRCodeComponent,Barcode128Component,DataMatrixComponent}.tsx` - use for rendering barcodes in UI
- **shadcn/ui Components**: Import from `@/components/ui/*` (Button, Card, Input, Select, etc.)
- **Client Components**: Most dashboard pages are `'use client'` due to Supabase hooks and state management

### Path Aliases
TypeScript `@/*` alias resolves to project root. Always use:
```typescript
import { supabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
```

## Development Workflow

### Running the Application
```bash
npm run dev     # Development server on localhost:3000
npm run build   # Production build
npm run start   # Production server
npm run lint    # ESLint check
```

### Environment Variables (Required)
```bash
NEXT_PUBLIC_SUPABASE_URL=<supabase_project_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase_anon_key>
```
Missing these will cause authentication failures. Check with the test connection button on signin page.

### Key Dependencies
- `@react-pdf/renderer`: PDF generation (used in `generateLabel.tsx`)
- `qrcode` / `jsbarcode`: Barcode generation
- `papaparse`: CSV parsing for bulk label upload
- `bwip-js`, `canvas`: Server-side barcode rendering
- `@supabase/ssr`: SSR-compatible Supabase client

## Common Tasks & Patterns

### Adding a New Dashboard Page
1. Create in `app/dashboard/<name>/page.tsx` with `'use client'` directive
2. Add navigation link in `app/dashboard/layout.tsx` sidebar
3. Fetch company data using pattern from `dashboard/generate/page.tsx`:
```typescript
const { data: { user } } = await supabaseClient().auth.getUser();
const { data: company } = await supabaseClient()
  .from('companies')
  .select('*')
  .eq('user_id', user.id)
  .single();
```

### Creating API Routes
Follow pattern in `app/api/verify/route.ts`:
- Use `NextRequest` / `NextResponse` from `next/server`
- Create Supabase client with `createClient()` (not SSR variant)
- Support both POST and GET methods for flexibility
- Always validate input and return proper error responses

### Working with Forms
- Use React Hook Form + Zod for validation (pattern in `dashboard/generate/page.tsx`)
- Date inputs: HTML5 `<input type="date">` requires `YYYY-MM-DD`, convert for storage
- Always disable submit buttons during async operations (`disabled={loading}`)
- Show user feedback with alerts or toast notifications (`sonner` library available)

### Styling Conventions
- **Brand Colors**: `#0052CC` (blue), `#FF6B35` or `orange-500` (orange)
- **Layout**: Use Tailwind utilities, avoid custom CSS
- **Responsive**: Grid layouts for forms (`grid grid-cols-2 gap-4`)
- **Cards**: Use `Card` component with `p-10` for consistent padding

## Critical Gotchas

1. **GTIN Generation**: Auto-generated GTINs start with `890` prefix: `890${12-digit-random}`. These are unique identifiers, not real GS1 GTINs.
2. **Middleware Placement**: `middleware.ts` must be in `app/` directory for Next.js 14 App Router
3. **PDF Generation**: Must run client-side due to canvas dependencies. Use `'use client'` directive.
4. **Supabase Auth State**: Check `user` existence before database operations. Handle pending company data in localStorage if user verified email after signup.
5. **CSV Upload Format**: Headers must be `productName,batchNo,mfgDate,expiryDate,mrp,gtin`. See template download in `dashboard/generate/page.tsx`.

## Testing & Debugging

### Verify Supabase Connection
Use the "Test Supabase Connection" button on `/auth/signin` page. Checks:
- Environment variables set
- Supabase client initialization
- Session retrieval

### Common Issues
- **"No company found"**: User signed in but `companies` table entry missing. Check `auth/signup` flow.
- **PDF download fails**: Console logs in `generateLabel.tsx` show detailed errors. Verify canvas dependencies.
- **Auth redirect loops**: Check middleware matcher config and session refresh.

## File Structure Reference
```
app/
  ├── auth/           # Authentication pages (signin, signup, reset-password)
  ├── dashboard/      # Protected dashboard area (requires auth)
  ├── api/            # API routes (verify endpoints)
  └── middleware.ts   # Route protection middleware
lib/
  ├── supabase/       # Supabase client factories (client.ts, server.ts)
  └── generateLabel.tsx  # Core barcode/PDF generation logic
components/
  ├── custom/         # Project-specific components (barcode renderers)
  └── ui/             # shadcn/ui components
```

## Best Practices
- Fetch user + company data at page load in dashboard routes
- Log generation events to both `product_batches` and `generated_labels` tables
- Use `console.log` extensively in label generation for debugging
- Provide clear user feedback for all async operations
- Handle edge cases: missing company, unverified email, invalid CSV format
