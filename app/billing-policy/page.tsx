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
              RxTrace offers a 15-day free trial period with full access to all plan features. No charges are applied during the trial period.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Full access to all plan features during trial</li>
              <li>No charges applied during the 15-day trial period</li>
              <li>No payment or credit card required to start the trial</li>
              <li>After trial ends, choose a subscription plan from the Pricing page to continue</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">After Trial Ends</h2>
            <p className="text-gray-700 mb-4">
              Your selected subscription plan amount will be charged automatically via Razorpay at the end of the trial period.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Automatic billing begins after trial period expires</li>
              <li>Charges are based on your selected plan (Starter Monthly/Yearly, Growth Monthly/Yearly, Enterprise Monthly/Quarterly)</li>
              <li>Billing cycle follows your plan&apos;s billing period (monthly, quarterly, or annual)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Auto-Renewal</h2>
            <p className="text-gray-700 mb-4">
              Subscriptions are set to auto-renew by default. Automated recurring debit occurs from your saved payment method each billing cycle.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Subscriptions automatically renew at the end of each billing cycle</li>
              <li>Payment is processed automatically from your saved payment method</li>
              <li>You will receive email notifications before each renewal</li>
              <li>You can cancel auto-renewal at any time from your dashboard</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Payment Method</h2>
            <p className="text-gray-700 mb-4">
              All payments are processed securely through Razorpay. Your payment card details are saved securely for automatic billing.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Payments are processed securely via Razorpay</li>
              <li>Card details are encrypted and stored securely</li>
              <li>We accept all major credit and debit cards</li>
              <li>All prices are exclusive of applicable GST</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Plan Pricing</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-3">
              <div>
                <p className="font-semibold text-gray-900">Starter Monthly: ₹18,000/month</p>
                <p className="font-semibold text-gray-900">Starter Yearly: ₹2,00,000/year</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Growth Monthly: ₹49,000/month</p>
                <p className="font-semibold text-gray-900">Growth Yearly: ₹5,00,000/year</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Enterprise Monthly: ₹2,00,000/month</p>
                <p className="font-semibold text-gray-900">Enterprise Quarterly: ₹6,00,000/quarter</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Add-ons</h2>
            <p className="text-gray-700 mb-4">
              Additional features and capacity can be purchased as add-ons. Add-ons are charged separately and only when explicitly enabled by the user.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Additional User IDs (Seats): ₹3,000/month each</li>
              <li>Additional Unit Labels: Available as per plan limits</li>
              <li>Add-ons are charged only when enabled</li>
              <li>Add-on charges are included in your monthly billing cycle</li>
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
