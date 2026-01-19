import Link from 'next/link';
import Image from 'next/image';

export default function CancellationPolicyPage() {
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
        <h1 className="text-4xl font-bold mb-4">Cancellation & Refund Policy</h1>
        <p className="text-gray-600 mb-8">Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="prose prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">Cancellation During Trial Period</h2>
            <p className="text-gray-700 mb-4">
              You can cancel your subscription at any time during the 15-day free trial period. Cancellation during the trial period results in absolutely zero charges.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Cancel anytime before the trial period ends</li>
              <li>No charges will be applied if cancelled during trial</li>
              <li>The ₹5 authorization charge (if paid) will be refunded</li>
              <li>Access continues until the end of the trial period</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Cancellation After Trial</h2>
            <p className="text-gray-700 mb-4">
              After the trial period ends, you can cancel your subscription at any time from your dashboard. To avoid charges for the next billing cycle, cancel before the renewal date.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Cancel anytime from your dashboard (Billing → Cancel Subscription)</li>
              <li>Cancel before the next billing cycle to avoid charges</li>
              <li>Your subscription will remain active until the end of the current billing period</li>
              <li>You will continue to have access to all features until the period ends</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">How to Cancel</h2>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <ol className="list-decimal list-inside space-y-3 text-gray-700">
                <li>Log in to your RxTrace dashboard</li>
                <li>Navigate to the Billing page</li>
                <li>Click on the &quot;Cancel Subscription&quot; button</li>
                <li>Confirm your cancellation</li>
                <li>You will receive a confirmation email</li>
              </ol>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Refund Policy</h2>
            <p className="text-gray-700 mb-4">
              RxTrace operates on a subscription model with the following refund terms:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li><strong>No refunds for partial months:</strong> If you cancel mid-cycle, you will continue to have access until the end of the current billing period, but no refund will be issued for the unused portion.</li>
              <li><strong>Cancel before renewal:</strong> To avoid charges for the next billing cycle, cancel before the renewal date.</li>
              <li><strong>Trial authorization charge:</strong> The ₹5 authorization charge paid during trial activation is fully refundable if you cancel during the trial period.</li>
              <li><strong>Add-ons:</strong> Add-on charges are non-refundable once the billing cycle has started.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Reactivation</h2>
            <p className="text-gray-700 mb-4">
              If you cancel your subscription, you can reactivate it at any time. Reactivation will start a new billing cycle.
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Reactivate from your dashboard at any time</li>
              <li>A new billing cycle will begin upon reactivation</li>
              <li>You will be charged according to your selected plan</li>
              <li>All your data and settings will be restored</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Contact</h2>
            <p className="text-gray-700">
              For cancellation requests or questions about this policy, please contact us at{' '}
              <a href="mailto:support@rxtrace.in" className="text-blue-600 hover:underline">
                support@rxtrace.in
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
