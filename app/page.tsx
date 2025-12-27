// Next.js 14 App Router – Production-ready RxTrace Landing Page
// Path: app/page.tsx

import Image from "next/image";
import Link from "next/link";
import BookDemoForm from "@/components/BookDemoForm";

export default function HomePage() {
  return (
    <main className="bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur bg-white/80 border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="RxTrace" width={36} height={36} />
            <span className="font-semibold text-lg">RxTrace</span>
          </div>
          <nav className="hidden md:flex gap-8 text-sm font-medium">
            <Link href="/compliance">Compliance</Link>
            <Link href="#services">Services</Link>
            <Link href="#pricing">Pricing</Link>
            <Link href="#security">Security</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/auth/signin" className="text-sm">Login</Link>
            <Link href="/auth/signup" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm shadow hover:bg-blue-700">
              Register (Setup Company)
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-blue-700 to-blue-500 text-white">
        <div className="max-w-7xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Enterprise-Grade Pharmaceutical Traceability
            </h1>
            <p className="mt-6 text-lg text-blue-100">
              GS1-compliant unit-to-pallet tracking with zero consumer data capture.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              <li>✔ GS1 QR & DataMatrix only</li>
              <li>✔ Unit → Box → Carton → Pallet (SSCC)</li>
              <li>✔ Code-only security model</li>
            </ul>
          </div>

          <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl p-8 text-slate-900">
            <h3 className="text-lg font-semibold mb-4">Book a Demo</h3>
            <BookDemoForm className="space-y-4" />
          </div>
        </div>
      </section>

{/* Compliance Overview */}
<section className="py-20 bg-slate-50">
  <div className="max-w-7xl mx-auto px-6">
    <h2 className="text-3xl font-semibold text-center">
      Regulatory Compliance Overview
    </h2>
    <p className="text-center text-slate-600 mt-4 max-w-3xl mx-auto">
      RxTrace supports GS1-aligned serialization and traceability workflows
      required under major global and Indian pharmaceutical regulations.
    </p>

    <div className="mt-12 grid md:grid-cols-4 gap-6">
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold mb-2">EU-FMD</h3>
        <p className="text-sm text-slate-600">
          Mandatory GS1 DataMatrix with unique identifier for prescription
          medicines across the European Union.
        </p>
        <a href="/compliance" className="text-sm text-blue-600 font-medium mt-3 inline-block">
          Read more →
        </a>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold mb-2">US-FDA (DSCSA)</h3>
        <p className="text-sm text-slate-600">
          Serialized product identifiers required for interoperable electronic
          tracing of prescription drugs.
        </p>
        <a href="/compliance" className="text-sm text-blue-600 font-medium mt-3 inline-block">
          Read more →
        </a>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold mb-2">Indian FDA</h3>
        <p className="text-sm text-slate-600">
          QR / barcode mandate for top drug formulations under amended Drugs &
          Cosmetics Rules.
        </p>
        <a href="/compliance" className="text-sm text-blue-600 font-medium mt-3 inline-block">
          Read more →
        </a>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold mb-2">CDSCO</h3>
        <p className="text-sm text-slate-600">
          GS1-based identification and traceability aligned with India’s central
          drug regulator guidelines.
        </p>
        <a href="/compliance" className="text-sm text-blue-600 font-medium mt-3 inline-block">
          Read more →
        </a>
      </div>
    </div>
  </div>
</section>

      {/* How it Works */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-semibold text-center">How RxTrace Works</h2>
          <div className="mt-12 grid md:grid-cols-4 gap-8">
            {[
              "Company onboarding",
              "SKU & product master",
              "Packaging rules",
              "Unit-level GS1 codes",
              "Box & carton aggregation",
              "Pallet SSCC generation",
              "Scanner verification",
              "Audit-ready dashboard",
            ].map((step, i) => (
              <div key={step} className="text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-blue-600 text-white flex items-center justify-center mb-4">
                  {i + 1}
                </div>
                <p className="text-sm">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industry Support */}
      <section id="services" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-semibold text-center">Industry Support</h2>
          <div className="mt-12 grid md:grid-cols-4 gap-6">
            {["Pharma Manufacturers","API & Bulk Drugs","CMOs","Medical Devices","Logistics","Distributors","Warehouses"].map(
              (item) => (
                <div key={item} className="bg-white rounded-xl shadow p-6 text-center">
                  <p className="text-sm font-medium">{item}</p>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="py-20 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-semibold text-center">Security & Data Integrity</h2>
          <div className="mt-12 grid md:grid-cols-5 gap-6">
            {[
              "Unit-level label generation",
              "No backend data capture",
              "Code-only trust model",
              "Controlled handset access",
              "Audit-ready logs",
            ].map((item) => (
              <div key={item} className="bg-white/10 backdrop-blur rounded-xl p-6 text-center">
                <p className="text-sm">{item}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-slate-300">
            Trust is embedded in the code — not in stored personal data.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-12">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-8">
          <div>
            <p className="font-semibold text-white">RxTrace</p>
            <p className="text-sm mt-2">GS1-compliant traceability platform</p>
          </div>
          <div>
            <table className="text-sm w-full">
              <tbody>
                <tr>
                  <td className="py-1">
                    <Link href="/privacy" className="text-slate-300 hover:text-white">Privacy Policy</Link>
                  </td>
                </tr>
                <tr>
                  <td className="py-1">
                    <Link href="/terms" className="text-slate-300 hover:text-white">User Policy</Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-sm space-y-2">
            <Link href="#">LinkedIn</Link>
            <Link href="#">X</Link>
          </div>
          <div>
            <p className="text-sm">Download Scanner App</p>
            <Link
              href="#"
              className="mt-2 inline-flex items-center gap-2 rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
              aria-label="Download on Google Play"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="opacity-90"
              >
                <path d="M4 3.5v17c0 .8.9 1.3 1.6.9l14.4-8.5c.6-.4.6-1.3 0-1.7L5.6 2.6C4.9 2.2 4 2.7 4 3.5Z" fill="currentColor" />
              </svg>
              <span>Google Play</span>
            </Link>
          </div>
        </div>
        <p className="text-center text-xs text-slate-500 mt-8">© RxTrace. All rights reserved.</p>
      </footer>
    </main>
  );
}
