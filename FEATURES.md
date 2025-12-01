# RxTrace India - Features Documentation

## 🎯 Overview
RxTrace India is a comprehensive pharmaceutical traceability platform that generates GS1-compliant labels for medicine authentication and tracking. Built with Next.js 14, TypeScript, Supabase, and designed for the Indian pharmaceutical industry.

---

## 📋 Core Features

### 1. **GS1-Compliant Label Generation**
Generate industry-standard barcodes that comply with GS1 specifications for pharmaceutical products.

**Supported Formats:**
- **QR Code** - Quick Response codes with full GS1 data encoding
- **GS1-128 (Code 128)** - Linear barcode with FNC1 character support
- **DataMatrix** - 2D matrix barcode for high-density encoding

**GS1 Application Identifiers (AI) Implemented:**
- `(01)` GTIN - Global Trade Item Number (14 digits)
- `(17)` Expiry Date - YYMMDD format
- `(10)` Batch/Lot Number - Variable length
- `(11)` Manufacturing Date - YYMMDD format
- `(21)` Serial Number - Variable length (optional)

**Technical Implementation:**
- FNC1 character prefix (`^FNC1`) for proper GS1-128 encoding
- Group Separator (ASCII 29) after variable-length fields
- Automatic GTIN generation with 890 prefix for Indian products
- Date conversion: DD-MM-YYYY (UI) → YYMMDD (GS1) → DD-MM-YYYY (Display)

---

### 2. **Manual Label Generation**
Create individual product labels through an intuitive form interface.

**Features:**
- Real-time GS1 preview before generation
- Product information capture:
  - SKU/Product Name
  - Manufacturing Date (MFG)
  - Expiry Date
  - Maximum Retail Price (MRP)
  - Batch Number
  - Auto-generated or custom GTIN
- Quantity selection (1-10,000 labels)
- Format selection: PDF, PNG, ZPL (Zebra), EPL (Eltron)
- Direct download or print options
- Database storage for verification and tracking

**Output Formats:**
- **PDF**: Multi-code grid layout (100 codes per A4 page, 80x80pt each)
- **PNG**: Individual image files
- **ZPL**: Zebra printer format for thermal printers
- **EPL**: Eltron printer format for legacy systems

---

### 3. **Bulk CSV Upload**
Generate thousands of labels at once using CSV file upload.

**CSV Template Format:**
```csv
productName,batchNo,mfgDate,expiryDate,mrp,gtin
Paracetamol 500mg,BATCH001,25-11-2025,25-11-2027,299.00,8901234567890
Crocin 650mg,BATCH002,01-12-2025,01-12-2027,150.00,8909876543210
```

**Features:**
- Drag-and-drop file upload
- Template download for proper formatting
- Automatic GTIN generation for missing values
- Batch processing with error handling
- Same output format options as manual generation
- Progress tracking and completion notifications

---

### 4. **GS1 Parser & Scanner Integration**
Parse and extract data from scanned GS1 barcodes.

**Parsing Capabilities:**
- Handles barcode format (without parentheses): `01GTIN17YYMMDD10BATCH<GS>11YYMMDD`
- Handles human-readable format (with parentheses): `(01)GTIN(17)YYMMDD(10)BATCH(11)YYMMDD`
- FNC1 character removal
- Group Separator (GS) detection and parsing
- Variable-length field extraction

**Data Extraction:**
- GTIN (14 digits)
- Expiry Date (converted to DD-MM-YYYY)
- Batch Number
- Manufacturing Date (converted to DD-MM-YYYY)
- Serial Number (if present)

---

### 5. **Product Verification API**
Verify product authenticity by scanning generated labels.

**Endpoint:** `/api/verify`

**Features:**
- GS1 data parsing from scanned codes
- Database lookup by GTIN
- Batch number and expiry date verification
- Complete product information retrieval
- RxTrace verification status

**Response Format:**
```json
{
  "verified": true,
  "rxtraceVerified": true,
  "scannedData": "Product: Paracetamol 500mg | MRP: ₹125.00 | MFG: 01-12-2024 | Expiry: 31-12-2025 | Batch: BATCH001",
  "parsedGS1": {
    "gtin": "08901234567890",
    "expiryDate": "31-12-2025",
    "batchNo": "BATCH001",
    "mfgDate": "01-12-2024"
  },
  "product": {
    "companyName": "ABC Pharma Ltd",
    "skuName": "Paracetamol 500mg",
    "gtin": "08901234567890",
    "batchNo": "BATCH001",
    "mfgDate": "01-12-2024",
    "expiryDate": "31-12-2025",
    "mrp": 125.00
  }
}
```

**Display Format for Scanner Apps:**
```
Product: [Product Name] | MRP: ₹[Price] | MFG: [Date] | Expiry: [Date] | Batch: [Batch No]
```

---

### 6. **User Authentication & Authorization**
Secure access control using Supabase Authentication.

**Features:**
- Email/password authentication
- Email verification
- Password reset functionality
- Protected dashboard routes via middleware
- Company association for multi-tenant support

**Route Protection:**
- `/dashboard/*` routes require authentication
- Automatic redirect to sign-in for unauthenticated users
- Company verification before label generation

---

### 7. **Company Management**
Associate users with pharmaceutical companies for label generation.

**Company Data:**
- Company Name
- GST Number
- Contact Person
- Email Address
- Phone Number
- Physical Address

**Features:**
- Company registration during signup
- Single company per user account
- Company branding on generated labels
- Company-specific label history

---

### 8. **Label History & Analytics**
Track all generated labels with comprehensive logging.

**Database Tables:**
- **`product_batches`**: Product metadata and batch information
  - GTIN, SKU name, batch number, dates, MRP
  - Company information
  - Label count per batch
  - Generation timestamp

- **`generated_labels`**: Label generation events
  - Label type (QR/CODE128/DATAMATRIX)
  - Output format (PDF/PNG/ZPL/EPL)
  - Quantity generated
  - User and company association
  - Timestamp

**Future Analytics:**
- Dashboard with generation statistics
- Label usage patterns
- Expiry date tracking
- Batch recall management

---

### 9. **Print Integration**
Direct printing support for generated labels.

**Features:**
- Browser-based PDF printing
- Print preview in new window
- Support for standard A4 printers
- Thermal printer formats (ZPL/EPL)
- Multi-label printing in single operation

---

### 10. **Responsive Design**
Mobile-friendly interface built with Tailwind CSS.

**Features:**
- Responsive grid layouts
- Mobile-optimized forms
- Touch-friendly controls
- Adaptive navigation
- shadcn/ui component library

**Brand Colors:**
- Primary Blue: `#0052CC`
- Accent Orange: `#FF6B35` / `orange-500`

---

## 🔧 Technical Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **State Management**: React Hooks

### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with SSR
- **API Routes**: Next.js API Routes
- **File Handling**: Server-side PDF generation

### Label Generation Libraries
- **bwip-js** (v4.8.0): GS1-128 and DataMatrix generation
- **qrcode** (v1.5.4): QR code generation
- **jsbarcode**: Fallback barcode generation
- **@react-pdf/renderer**: PDF document creation
- **canvas**: Server-side barcode rendering

### Data Processing
- **papaparse**: CSV parsing for bulk upload
- **date-fns**: Date manipulation and formatting

---

## 🚀 Deployment

### Environment Variables Required
```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

### Deployment Platforms
- **Primary**: Vercel (automatic deployment from GitHub)
- **Database**: Supabase Cloud
- **CDN**: Vercel Edge Network

---

## 📱 Scanner App Integration

### Supported Scanner Apps
- Any GS1-compliant barcode scanner
- Mobile apps with GS1 parsing support
- Custom RxTrace scanner (future development)

### Integration Flow
1. User scans barcode/QR code with scanner app
2. Scanner extracts GS1 data string
3. App sends data to `/api/verify` endpoint
4. System parses GS1 and looks up in database
5. Returns complete product information
6. Display format: **Product Name | MRP | MFG | Expiry | Batch**

---

## 🔐 Security Features

- Row-level security (RLS) in Supabase
- User-specific data isolation
- Company-based access control
- Secure authentication flow
- Protected API endpoints
- Environment variable encryption

---

## 📊 Database Schema

### Tables

**`companies`**
- `id`, `user_id`, `company_name`, `gst_number`
- `contact_person`, `email`, `phone`, `address`
- `created_at`

**`product_batches`**
- `id`, `user_id`, `company_name`, `gtin`, `sku_name`
- `batch_no`, `mfd`, `expiry`, `mrp`
- `labels_count`, `generated_at`

**`generated_labels`**
- `id`, `user_id`, `company_id`
- `label_type`, `format`, `quantity`
- `gtin`, `batch_no`, `expiry_date`
- `created_at`

---

## 🎨 UI/UX Features

- Clean, professional interface
- Intuitive form validation
- Real-time GS1 preview
- Loading states and progress indicators
- Error handling with user feedback
- Toast notifications (sonner library)
- Accessible form controls
- Color-coded status indicators

---

## 📝 Future Enhancements

### Planned Features
- [ ] Advanced analytics dashboard
- [ ] Batch recall management system
- [ ] QR code customization (logo, colors)
- [ ] Export history to Excel/CSV
- [ ] Mobile app for on-the-go label generation
- [ ] Barcode scanner SDK integration
- [ ] Multi-language support (Hindi, regional languages)
- [ ] Supply chain tracking integration
- [ ] API for third-party integrations
- [ ] Blockchain-based verification (as per project name)

### Under Consideration
- [ ] NFC tag integration
- [ ] Serial number tracking
- [ ] Expiry alert notifications
- [ ] Regulatory compliance reports
- [ ] Integration with CDSCO (Central Drugs Standard Control Organisation)

---

## 📄 License & Compliance

### GS1 Compliance
This application generates GS1-compliant barcodes following official standards:
- GS1 General Specifications (v23)
- Application Identifier definitions
- Data encoding rules
- FNC1 character usage

### Note on GTINs
Auto-generated GTINs use the `890` prefix (commonly used for internal/test purposes). For production use with official GS1 registration, companies should obtain registered GTINs from GS1 India.

---

## 🆘 Support & Documentation

- **Main Documentation**: `/README.md`
- **Privacy Policy**: `/app/scanner/privacy-policy/page.tsx`
- **Coding Instructions**: `/.github/copilot-instructions.md`
- **CSV Template**: Download from dashboard
- **Test Connection**: Available on sign-in page

---

## 👥 User Roles

### Current Implementation
- **Single Role**: Authenticated Company Users
  - Can generate labels
  - Can view own history
  - Can verify products

### Future Roles
- **Admin**: System administration
- **Viewer**: Read-only access
- **API User**: Programmatic access

---

## 🔄 Version History

### v1.0.0 (Current)
- ✅ GS1-compliant label generation
- ✅ Manual and CSV upload
- ✅ QR, Code 128, DataMatrix support
- ✅ GS1 parser implementation
- ✅ Product verification API
- ✅ Complete scanner integration
- ✅ Database logging

---

**Last Updated**: December 1, 2025
**Maintained By**: RxTrace India Development Team
**Contact**: Available through platform
