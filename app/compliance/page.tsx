// Next.js 14 App Router – Compliance Page
// Path: app/compliance/page.tsx
// Production-ready, regulator-safe, no client hooks

import Link from "next/link";

export default function CompliancePage() {
  return (
    <main className="bg-white text-slate-900">

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-800 to-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <h1 className="text-4xl md:text-5xl font-bold max-w-3xl">
            GS1 QR and DataMatrix Compliance for Regulated Industries
          </h1>
          <p className="mt-6 text-lg text-blue-100 max-w-3xl">
            RxTrace enables GS1 aligned identification and traceability for pharmaceutical, food, and dairy companies. It is built for audit readiness and privacy safe compliance.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            <li>GS1 QR and DataMatrix only</li>
            <li>Unit to Box to Carton to Pallet (SSCC)</li>
            <li>No consumer or patient data capture</li>
          </ul>
        </div>
      </section>

      {/* Body A – Regulatory Coverage */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-semibold text-center">Regulatory Requirements Coverage</h2>
          <p className="text-center text-slate-600 mt-4 max-w-3xl mx-auto">
            RxTrace supports GS1 aligned workflows that help organizations meet global and Indian regulatory traceability expectations.
          </p>

          <div className="mt-12 space-y-10 max-w-4xl mx-auto">
            <div>
              <h3 className="text-xl font-semibold">European Union – Falsified Medicines Directive (EU FMD)</h3>
              <p className="mt-2 text-sm text-slate-700">
                The EU Falsified Medicines Directive 2011/62/EU and Delegated Regulation (EU) 2016/161 mandate that prescription medicines carry a unique identifier consisting of GTIN, serial number, batch number, and expiry date. This information is encoded in a GS1 DataMatrix barcode and verified through the European Medicines Verification System.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold">United States – Drug Supply Chain Security Act (DSCSA)</h3>
              <p className="mt-2 text-sm text-slate-700">
                The DSCSA requires an interoperable electronic tracing system for prescription drugs. The product identifier includes product code, serial number, lot number, and expiration date. When GS1 standards are used, this is encoded as a serialized GTIN in a GS1 DataMatrix barcode.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold">India – Drugs and Cosmetics Rules (Indian FDA)</h3>
              <p className="mt-2 text-sm text-slate-700">
                As per GSR 823(E) dated 17 November 2022, the Drugs Rules 1945 were amended to mandate barcodes or QR codes on primary and secondary packaging of the top 300 drug formulations. Required data includes product identification, batch number, manufacturing date, expiry date, and manufacturing licence number.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold">Central Drugs Standard Control Organisation (CDSCO)</h3>
              <p className="mt-2 text-sm text-slate-700">
                CDSCO supports GS1 based identification and traceability practices aligned with global serialization and aggregation standards for pharmaceutical manufacturing and exports.
              </p>
            </div>
          </div>

          <p className="mt-10 text-center text-xs text-slate-500 max-w-3xl mx-auto">
            RxTrace supports GS1 aligned compliance workflows. Final regulatory compliance depends on customer implementation and applicable local regulations.
          </p>
        </div>
      </section>

      {/* Body B – GS1 Payload Logic */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-semibold text-center">GS1 Payload Logic</h2>
          <p className="text-center text-slate-600 mt-4 max-w-3xl mx-auto">
            RxTrace uses a GS1 compliant, code only payload model where compliance information is embedded directly into the barcode or QR code without capturing consumer or patient data.
          </p>

          <div className="mt-12 grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">

            <div className="border rounded-xl p-6 bg-slate-50">
              <h3 className="font-semibold mb-3">(01) GTIN – Product Identification</h3>
              <ul className="text-sm space-y-2">
                <li>Globally unique product identification as per GS1 standards</li>
                <li>Ensures product authenticity across supply chain</li>
                <li>Used by RxTrace to link SKU and product master</li>
                <li>Compatible with EU, US, and Indian regulations</li>
              </ul>
            </div>

            <div className="border rounded-xl p-6 bg-slate-50">
              <h3 className="font-semibold mb-3">(17) Expiry Date</h3>
              <ul className="text-sm space-y-2">
                <li>Mandatory for regulated pharmaceutical products</li>
                <li>Enables expiry validation during scanning</li>
                <li>Prevents circulation of expired medicines</li>
                <li>Read and validated directly by RxTrace scanner</li>
              </ul>
            </div>

            <div className="border rounded-xl p-6 bg-slate-50">
              <h3 className="font-semibold mb-3">(11) Manufacturing Date</h3>
              <ul className="text-sm space-y-2">
                <li>Supports Indian FDA and CDSCO requirements</li>
                <li>Used for batch age and shelf life calculations</li>
                <li>Displayed clearly during verification scans</li>
                <li>Embedded directly in GS1 payload</li>
              </ul>
            </div>

            <div className="border rounded-xl p-6 bg-slate-50">
              <h3 className="font-semibold mb-3">(10) Batch or Lot Number</h3>
              <ul className="text-sm space-y-2">
                <li>Critical for recalls and quality investigations</li>
                <li>Links units to manufacturing batch</li>
                <li>Validated by RxTrace without backend data capture</li>
                <li>Supports regulator and auditor traceability needs</li>
              </ul>
            </div>

            <div className="border rounded-xl p-6 bg-slate-50">
              <h3 className="font-semibold mb-3">(21) Unique Serial Number</h3>
              <ul className="text-sm space-y-2">
                <li>Legally required for EU FMD and US DSCSA</li>
                <li>Uniquely identifies every saleable unit</li>
                <li>Generated and validated by RxTrace engine</li>
                <li>Prevents duplication and counterfeiting</li>
              </ul>
            </div>

            <div className="border rounded-xl p-6 bg-slate-50">
              <h3 className="font-semibold mb-3">(00) SSCC – Logistic Units</h3>
              <ul className="text-sm space-y-2">
                <li>Used for cartons and pallets aggregation</li>
                <li>Links unit to box, carton, and pallet hierarchy</li>
                <li>Required for warehouse and distributor operations</li>
                <li>Fully supported by RxTrace packaging rules</li>
              </ul>
            </div>

          </div>

          <p className="mt-10 text-center text-sm text-slate-700 max-w-3xl mx-auto">
            RxTrace follows a code centric compliance model where trust is embedded in the GS1 payload itself, ensuring privacy safe, audit ready, and regulator friendly traceability.
          </p>
        </div>
      </section>

      {/* Body C – Scanner App Support */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-semibold text-center">Scanner App Support</h2>
          <p className="text-center text-slate-600 mt-4 max-w-3xl mx-auto">
            RxTrace scanner applications are designed for verification purposes only and not for surveillance.
          </p>

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {["Reads GS1 QR and DataMatrix from any compliant source","Supports unit, box, carton, and pallet scans","Offline capable verification","No login required for unit level scan","Token based access for higher level scans","No data capture during scanning"].map(
              (item) => (
                <div key={item} className="bg-white rounded-xl shadow p-6 text-sm">
                  {item}
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Body D – Audit Reports */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-semibold text-center">Downloadable Audit Reports</h2>
          <p className="text-center text-slate-600 mt-4 max-w-3xl mx-auto">
            Generate regulator ready reports without exposing personal, patient, or consumer data.
          </p>

          <div className="mt-12 grid md:grid-cols-2 gap-6">
            <div className="border rounded-xl p-6 bg-slate-50">
              <h3 className="font-semibold mb-2">Included Reports</h3>
              <ul className="text-sm space-y-2">
                <li>Code generation logs</li>
                <li>Packaging rule definitions</li>
                <li>Aggregation hierarchy from unit to pallet</li>
                <li>Scanner authorization records</li>
              </ul>
            </div>
            <div className="border rounded-xl p-6 bg-slate-50">
              <h3 className="font-semibold mb-2">Export Formats</h3>
              <ul className="text-sm space-y-2">
                <li>PDF regulator friendly</li>
                <li>CSV for internal audits</li>
                <li>Digitally signed exports if required</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 bg-blue-700 text-white text-center">
        <h2 className="text-2xl font-semibold">Ready for Compliance First Traceability</h2>
        <p className="mt-4 text-blue-100">Talk to our team or download a compliance overview.</p>
        <div className="mt-6 flex justify-center gap-4">
          <Link href="/contact" className="px-6 py-3 bg-white text-blue-700 rounded-xl font-medium">
            Contact Sales
          </Link>
          <Link href="#" className="px-6 py-3 border border-white rounded-xl">
            Download Overview
          </Link>
        </div>
      </section>

    </main>
  );
}
