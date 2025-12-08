# 🏥 RxTrace India - Pharmaceutical Traceability Platform

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20DB-green)](https://supabase.com/)

> **Note**: This repository is for the **RxTrace pharmaceutical traceability platform**. For GitHub Copilot billing or support issues, please visit [GitHub Support](https://support.github.com/) or check [SUPPORT.md](./SUPPORT.md).

## 📌 About RxTrace India

RxTrace India is a comprehensive pharmaceutical traceability platform that generates **GS1-compliant labels** (QR codes, barcodes, DataMatrix) for medicine authentication and tracking. Built specifically for the Indian pharmaceutical industry to ensure drug authenticity and combat counterfeiting.

### Key Features

- ✅ **GS1-Compliant Label Generation** - QR codes, Code 128, DataMatrix
- ✅ **Bulk CSV Upload** - Generate thousands of labels at once
- ✅ **Product Verification API** - Scan and verify medicine authenticity
- ✅ **Multi-Format Support** - PDF, PNG, ZPL (Zebra), EPL (Eltron)
- ✅ **Supabase Authentication** - Secure user management
- ✅ **Company Management** - Multi-tenant support
- ✅ **Label History Tracking** - Complete audit trail

📖 **Full Feature Documentation**: [FEATURES.md](./FEATURES.md)

## 🚀 Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## 🔧 Environment Setup

Create a `.env.local` file in the root directory:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

**Important**: Without these environment variables, authentication will fail. Use the "Test Supabase Connection" button on the sign-in page to verify your setup.

## 📚 Documentation

- **[FEATURES.md](./FEATURES.md)** - Complete feature documentation
- **[SUPPORT.md](./SUPPORT.md)** - Support and help resources
- **[.github/copilot-instructions.md](./.github/copilot-instructions.md)** - Developer guide

## 🛠️ Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (Auth + PostgreSQL)
- **UI Components**: shadcn/ui, Radix UI
- **Label Generation**: bwip-js, qrcode, jsbarcode, @react-pdf/renderer
- **Data Processing**: papaparse (CSV), date-fns

## 📱 Usage

1. **Sign Up** - Create an account and register your company
2. **Generate Labels** - Use manual form or CSV bulk upload
3. **Download** - Get labels in PDF, PNG, ZPL, or EPL format
4. **Verify** - Scan labels to verify product authenticity via API

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🆘 Getting Help

- **RxTrace Issues**: Open an issue in this repository
- **GitHub Copilot Issues**: Visit [GitHub Support](https://support.github.com/)
- **Full Support Guide**: See [SUPPORT.md](./SUPPORT.md)

## 📄 License

This project is for the pharmaceutical traceability platform. See documentation for GS1 compliance notes.

## 🌟 Learn More About Next.js

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial

---

**Repository**: https://github.com/akshay2d/Rxtrace-blockchain  
**Last Updated**: December 8, 2024
