// app/scanner/privacy-policy/page.tsx
export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8 md:p-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
        <p className="text-sm text-gray-600 mb-8">Last Updated: December 1, 2025</p>

        <div className="space-y-8 text-gray-700">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
            <p className="leading-relaxed">
              Welcome to RxTrace India ("we," "our," or "us"). We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our pharmaceutical traceability platform and scanner application.
            </p>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>
            
            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-4">2.1 Information You Provide</h3>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Account Information:</strong> Name, email address, phone number, company name, GST number</li>
              <li><strong>Product Information:</strong> Product names, batch numbers, manufacturing dates, expiry dates, MRP, GTIN codes</li>
              <li><strong>Scanner Usage:</strong> Scanned barcode/QR code data for verification purposes</li>
            </ul>

            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-4">2.2 Automatically Collected Information</h3>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Device Information:</strong> Device type, operating system, browser type</li>
              <li><strong>Usage Data:</strong> Pages visited, features used, time spent on the platform</li>
              <li><strong>Location Data:</strong> Approximate location based on IP address (with your consent)</li>
              <li><strong>Camera Access:</strong> Camera permissions for scanning barcodes (scanner app only)</li>
            </ul>
          </section>

          {/* How We Use Your Information */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
            <p className="mb-3">We use the collected information for the following purposes:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Service Delivery:</strong> Generate GS1-compliant labels, verify product authenticity</li>
              <li><strong>Account Management:</strong> Create and manage user accounts, authenticate users</li>
              <li><strong>Analytics:</strong> Track label generation history, usage statistics</li>
              <li><strong>Communication:</strong> Send service updates, security alerts, and support responses</li>
              <li><strong>Compliance:</strong> Meet pharmaceutical regulatory requirements and maintain audit trails</li>
              <li><strong>Improvement:</strong> Enhance platform features and user experience</li>
            </ul>
          </section>

          {/* Data Sharing */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Information Sharing and Disclosure</h2>
            <p className="mb-3">We do not sell your personal information. We may share information in the following circumstances:</p>
            
            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-4">4.1 With Your Consent</h3>
            <p className="leading-relaxed">When you explicitly authorize us to share information.</p>

            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-4">4.2 Service Providers</h3>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Cloud hosting services (Vercel, Supabase)</li>
              <li>Authentication services</li>
              <li>Analytics providers</li>
            </ul>

            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-4">4.3 Legal Requirements</h3>
            <p className="leading-relaxed">
              We may disclose information when required by law, regulatory authorities, or to protect our rights, property, or safety.
            </p>

            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-4">4.4 Business Transfers</h3>
            <p className="leading-relaxed">
              In case of merger, acquisition, or sale of assets, your information may be transferred.
            </p>
          </section>

          {/* Scanner App Specific */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Scanner App Privacy</h2>
            
            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-4">5.1 Camera Permissions</h3>
            <p className="leading-relaxed mb-3">
              The RxTrace Scanner app requires camera access to scan barcodes and QR codes. We do not store or transmit camera images. Only the decoded barcode data is sent to our servers for verification.
            </p>

            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-4">5.2 Scan History</h3>
            <p className="leading-relaxed">
              Scan history is stored locally on your device and can be cleared at any time. We may log verification requests for analytics purposes.
            </p>

            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-4">5.3 Offline Mode</h3>
            <p className="leading-relaxed">
              The scanner app can function offline for scanning. Verification requires internet connectivity.
            </p>
          </section>

          {/* Data Security */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Data Security</h2>
            <p className="mb-3">We implement industry-standard security measures to protect your information:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Encryption:</strong> SSL/TLS encryption for data in transit</li>
              <li><strong>Authentication:</strong> Secure authentication via Supabase Auth</li>
              <li><strong>Access Control:</strong> Role-based access to data</li>
              <li><strong>Regular Audits:</strong> Security assessments and updates</li>
              <li><strong>Database Security:</strong> Encrypted database storage with Supabase</li>
            </ul>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Data Retention</h2>
            <p className="leading-relaxed">
              We retain your information for as long as your account is active or as needed to provide services. Product batch and label generation data is retained for regulatory compliance (typically 3-5 years as per pharmaceutical industry standards). You may request deletion of your account and associated data at any time.
            </p>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Your Privacy Rights</h2>
            <p className="mb-3">You have the following rights regarding your personal information:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Correction:</strong> Update or correct inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your account and data</li>
              <li><strong>Data Portability:</strong> Export your data in a structured format</li>
              <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications</li>
              <li><strong>Withdraw Consent:</strong> Revoke permissions (e.g., camera access)</li>
            </ul>
            <p className="mt-4 leading-relaxed">
              To exercise these rights, contact us at: <a href="mailto:privacy@rxtrace.in" className="text-blue-600 hover:underline">privacy@rxtrace.in</a>
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Cookies and Tracking</h2>
            <p className="leading-relaxed mb-3">
              We use cookies and similar technologies to enhance user experience, analyze usage, and maintain sessions. You can control cookies through your browser settings.
            </p>
            <p className="leading-relaxed">
              <strong>Types of cookies we use:</strong>
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mt-2">
              <li>Essential cookies for authentication and security</li>
              <li>Analytics cookies to understand usage patterns</li>
              <li>Preference cookies to remember your settings</li>
            </ul>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Third-Party Services</h2>
            <p className="mb-3">Our platform integrates with third-party services:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Supabase:</strong> Database and authentication (<a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy Policy</a>)</li>
              <li><strong>Vercel:</strong> Hosting and deployment (<a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy Policy</a>)</li>
            </ul>
            <p className="mt-3 leading-relaxed">
              We are not responsible for the privacy practices of third-party services.
            </p>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Children's Privacy</h2>
            <p className="leading-relaxed">
              Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.
            </p>
          </section>

          {/* International Users */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. International Data Transfers</h2>
            <p className="leading-relaxed">
              Your information may be transferred to and processed in countries other than India. We ensure appropriate safeguards are in place to protect your data in accordance with this Privacy Policy.
            </p>
          </section>

          {/* Changes to Policy */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Changes to This Privacy Policy</h2>
            <p className="leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the new policy on this page and updating the "Last Updated" date. Continued use of our services after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          {/* Contact Information */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">14. Contact Us</h2>
            <p className="leading-relaxed mb-4">
              If you have questions or concerns about this Privacy Policy or our data practices, please contact us:
            </p>
            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
              <p className="font-semibold text-gray-900 mb-2">RxTrace India</p>
              <p className="text-gray-700">Email: <a href="mailto:privacy@rxtrace.in" className="text-blue-600 hover:underline">privacy@rxtrace.in</a></p>
              <p className="text-gray-700">Support: <a href="mailto:support@rxtrace.in" className="text-blue-600 hover:underline">support@rxtrace.in</a></p>
              <p className="text-gray-700">Website: <a href="https://rxtrace.in" className="text-blue-600 hover:underline">https://rxtrace.in</a></p>
            </div>
          </section>

          {/* Consent */}
          <section className="mt-12 pt-8 border-t border-gray-200">
            <p className="text-gray-700 leading-relaxed">
              By using RxTrace India's platform and scanner application, you acknowledge that you have read, understood, and agree to this Privacy Policy.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500 text-center">
            © 2025 RxTrace India. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
