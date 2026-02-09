import Link from 'next/link';
import Image from 'next/image';

export default function BillingPolicyPage() {
  return (
    <main className="bg-white text-slate-900 min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur bg-white/80 border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
            <Image src="/logo.png" alt="RxTrace" width={36} height={36} />
            <span className="font-semibold text-lg">RxTrace</span>
          </Link>
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
            ← Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-4">Billing Policy</h1>
        <p className="text-gray-600 mb-8">Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="prose prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">Free Trial (15 Days)</h2>
            <p className="text-gray-700 mb-4">
              RxTrace offers a 15-day free trial period with full access to all features. 
              No charges are applied during the trial period.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Full access to all features during trial</li>
              <li>No charges applied during the 15-day trial period</li>
              <li>No payment or credit card required to start the trial</li>
              <li>Unlimited label generation during trial</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">After Trial Ends</h2>
            <p className="text-gray-700 mb-4">
              After your 15-day trial ends, you can choose to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Start a new trial (contact support for extension)</li>
              <li>Subscribe to a paid plan (coming soon)</li>
              <li>Contact us for enterprise solutions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">No Payment Required</h2>
            <p className="text-gray-700 mb-4">
              Since the trial is completely free, no payment information is collected:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>No credit card required for signup</li>
              <li>No charges during trial period</li>
              <li>No automatic billing setup</li>
              <li>No refund policy applies since no payments are made</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Contact</h2>
            <p className="text-gray-700">
              For billing inquiries or questions about this policy, please contact us at{' '}
              <a href="mailto:billing@rxtrace.in" className="text-blue-600 hover:underline">
                billing@rxtrace.in
              </a>
              {' '}or visit our{' '}
              <Link href="/contact" className="text-blue-600 hover:underline">
                Contact Us
              </Link>
              {' '}page.
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-12 mt-16">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} RxTrace. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
