export default function BillingPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="bg-white border border-gray-200 rounded-2xl p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Billing disabled during pilot</h1>
        <p className="text-gray-600 mt-3">
          Paid subscription and billing controls are disabled for this pilot rollout.
          For upgrades or commercial plans, please contact sales.
        </p>
        <a
          href="/contact"
          className="inline-block mt-5 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Contact Sales
        </a>
      </div>
    </div>
  );
}
