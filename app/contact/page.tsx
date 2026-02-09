"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronUp, Mail, Phone, MapPin, MessageCircle } from "lucide-react";
import TawkToChat from "@/components/TawkToChat";

// FAQ data
const faqs = [
  {
    question: "What is RxTrace India?",
    answer: "RxTrace India is a pharmaceutical traceability platform that generates GS1-compliant labels (QR codes, barcodes, DataMatrix) for medicine authentication and tracks them through the entire supply chain from unit to pallet level."
  },
  {
    question: "How does RxTrace ensure DAVA compliance?",
    answer: "RxTrace follows CDSCO/DAVA guidelines for pharmaceutical serialization in India. Our platform generates GS1-compliant codes with proper Application Identifiers (GTIN, batch number, expiry date, manufacturing date) as required by Track & Trace regulations."
  },
  {
    question: "What label formats does RxTrace support?",
    answer: "RxTrace supports multiple formats including PDF (for printing), PNG (for digital use), ZPL (for Zebra printers), and EPL (for Eltron printers). We generate GS1 DataMatrix, QR codes, and Code-128 barcodes."
  },
  {
    question: "What is the hierarchy of tracking in RxTrace?",
    answer: "RxTrace supports a complete packaging hierarchy: Unit (individual medicine) → Box → Carton → Pallet (with SSCC codes). This allows end-to-end traceability from manufacturing to distribution."
  },
  {
    question: "How do I get started with RxTrace?",
    answer: "You can book a demo through our website, and our team will walk you through the platform. After signup, you'll complete company verification and can start generating labels immediately with our 15-day free trial."
  },
  {
    question: "What pricing plans are available?",
    answer: "We offer a 15-day free trial with full access to all features. Visit our Pricing page for more details on continuing after your trial."
  },
  {
    question: "Is my data secure with RxTrace?",
    answer: "Absolutely. RxTrace follows a code-centric security model that minimizes data exposure. We use encrypted storage with Supabase, and we don't capture any consumer data - only pharmaceutical tracking information."
  },
  {
    question: "Can I integrate RxTrace with my existing systems?",
    answer: "Yes, RxTrace provides API access for enterprise integrations. Our platform can integrate with your ERP, WMS, and other supply chain systems. Contact our team for integration support."
  },
  {
    question: "How does the scanner app work?",
    answer: "Our Android scanner app allows field verification of medicines. Users can scan GS1 codes to verify authenticity, track product journey, and report suspicious products - all without capturing personal data."
  },
  {
    question: "What support options are available?",
    answer: "We offer email support, live chat through Tawk.to (available on this page), and dedicated account managers for enterprise customers. Our team is available Monday to Saturday, 9 AM to 6 PM IST."
  }
];

// FAQ Item Component
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-900 pr-4">{question}</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-blue-600 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="pb-4 text-gray-600 text-sm leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

export default function ContactPage() {
  return (
    <main className="bg-white text-slate-900 min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur bg-white/80 border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="RxTrace" width={36} height={36} />
            <span className="font-semibold text-lg">RxTrace</span>
          </Link>
          <nav className="hidden md:flex gap-8 text-sm font-medium">
            <Link href="/compliance">Compliance</Link>
            <Link href="/services">Services</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/contact" className="text-blue-600">Contact Us</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/auth/signin" className="text-sm">Log in</Link>
            <Link href="/auth/signup" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm shadow hover:bg-blue-700">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-700 to-blue-500 text-white py-16">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold">Contact Us</h1>
          <p className="mt-4 text-lg text-blue-100 max-w-2xl mx-auto">
            Have questions about RxTrace? Our team is here to help you with pharmaceutical traceability solutions.
          </p>
        </div>
      </section>

      {/* Contact Information + FAQs */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-3 gap-12">
            {/* Contact Cards */}
            <div className="lg:col-span-1 space-y-6">
              <h2 className="text-2xl font-semibold mb-6">Get in Touch</h2>
              
              {/* Email */}
              <div className="bg-slate-50 rounded-xl p-6 flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Email Us</h3>
                  <p className="text-sm text-gray-600 mt-1">For general inquiries and support</p>
                  <a href="mailto:Customer.support@rxtrace.in" className="text-blue-600 font-medium text-sm mt-2 inline-block">
                    Customer.support@rxtrace.in
                  </a>
                </div>
              </div>

              {/* Phone */}
              <div className="bg-slate-50 rounded-xl p-6 flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Call Us</h3>
                  <p className="text-sm text-gray-600 mt-1">Mon-Sat, 9 AM - 6 PM IST</p>
                  <a href="tel:+917768948800" className="text-blue-600 font-medium text-sm mt-2 inline-block">
                    +91 77689 48800
                  </a>
                </div>
              </div>

              {/* Location */}
              <div className="bg-slate-50 rounded-xl p-6 flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Office</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    RxTrace India<br />
                    Mumbai, Maharashtra<br />
                    India
                  </p>
                </div>
              </div>

              {/* Live Chat CTA */}
              <div className="bg-blue-600 rounded-xl p-6 text-white">
                <div className="flex items-center gap-3 mb-3">
                  <MessageCircle className="w-6 h-6" />
                  <h3 className="font-semibold">Live Chat</h3>
                </div>
                <p className="text-sm text-blue-100">
                  Need immediate assistance? Click the chat icon in the bottom right corner to chat with our team.
                </p>
              </div>
            </div>

            {/* FAQs Section */}
            <div className="lg:col-span-2">
              <h2 className="text-2xl font-semibold mb-6">Frequently Asked Questions</h2>
              <div className="bg-white border rounded-xl p-6">
                {faqs.map((faq, index) => (
                  <FAQItem key={index} question={faq.question} answer={faq.answer} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Book Demo CTA */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold">Ready to Get Started?</h2>
          <p className="mt-4 text-gray-600 max-w-2xl mx-auto">
            Book a personalized demo with our team to see how RxTrace can help your pharmaceutical business achieve compliance and traceability.
          </p>
          <Link
            href="/#book-demo"
            className="mt-8 inline-block px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            Book a Demo
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
                  <Image src="/logo.png" alt="RxTrace" width={32} height={32} />
                  <span className="font-semibold">RxTrace India</span>
                </Link>
              </div>
              <p className="text-sm text-gray-400">
                RxTrace is a traceability and serialization platform enabling secure product tracking using GS1-compliant codes across the supply chain.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Quick Links</h3>
              <nav className="flex flex-col gap-2 text-sm text-gray-400">
                <Link href="/compliance" className="hover:text-white">Compliance</Link>
                <Link href="/services" className="hover:text-white">Services</Link>
                <Link href="/pricing" className="hover:text-white">Pricing</Link>
                <Link href="/contact" className="hover:text-white">Help & Support</Link>
              </nav>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Legal</h3>
              <nav className="flex flex-col gap-2 text-sm text-gray-400">
                <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
                <Link href="/terms" className="hover:text-white">User Policy</Link>
                <Link href="/billing-policy" className="hover:text-white">Billing Policy</Link>
                <Link href="/cancellation-policy" className="hover:text-white">Cancellation & Refund Policy</Link>
              </nav>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6">
            <p className="text-center text-sm text-gray-500">
              © {new Date().getFullYear()} RxTrace India. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Tawk.to Chat Widget - Client-side only */}
      <TawkToChat />
    </main>
  );
}
