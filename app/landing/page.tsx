// app/landing/page.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ShieldCheck, 
  Zap, 
  Download, 
  Smartphone, 
  Package, 
  CheckCircle, 
  QrCode, 
  Users, 
  HeartHandshake, 
  Twitter, 
  Linkedin, 
  Youtube, 
  ArrowRight, 
  Pill 
} from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <>
      <div className="min-h-screen bg-white">
        {/* Navbar */}
        <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div className="container mx-auto px-4">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center gap-3">
                <Pill className="h-8 w-8 text-orange-500" />
                <span className="text-2xl font-bold text-[#0052CC]">RxTrace India</span>
              </div>

              <nav className="hidden md:flex items-center gap-8">
                <a href="#home" className="text-gray-700 hover:text-[#0052CC] font-medium">Home</a>
                <a href="#features" className="text-gray-700 hover:text-[#0052CC] font-medium">Features</a>
                <a href="#how-it-works" className="text-gray-700 hover:text-[#0052CC] font-medium">How it Works</a>
                <Link href="/pricing" className="text-gray-700 hover:text-[#0052CC] font-medium">Pricing</Link>
                <a href="#contact" className="text-gray-700 hover:text-[#0052CC] font-medium">Contact</a>
              </nav>

              <div className="flex items-center gap-4">
                <Link href="/dashboard">
                  <Button variant="outline" className="border-[#0052CC] text-[#0052CC] hover:bg-[#0052CC] hover:text-white">
                    My Dashboard
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button variant="outline" className="border-green-600 text-green-600 hover:bg-green-600 hover:text-white">
                    Pricing
                  </Button>
                </Link>
                <Link href="/auth/signin">
                  <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                    Login
                  </Button>
                </Link>
                <Link href="/auth/signup">
                  <Button variant="outline" className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white">
                    Register Company
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="py-24 lg:py-32">
          <div className="container mx-auto px-4 text-center">
            <div>
              <Badge className="mb-6 bg-orange-100 text-orange-600 text-lg px-4 py-2">
                India’s First Pharma Traceability Platform
              </Badge>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight mb-8">
                Save Your Brand & Patients<br />from Counterfeit Medicines
              </h1>
              <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto">
                Real GS1-compliant codes • Instant verification • 100% free for 30 days
              </p>
              <div className="flex flex-col sm:flex-row gap-6 justify-center">
                <Link href="/auth/signup">
                  <Button size="lg" className="bg-orange-500 hover:bg-orange-600 text-white text-xl px-10 py-8">
                    Start Free Trial <ArrowRight className="ml-3 h-5 w-5" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="border-[#0052CC] text-[#0052CC] hover:bg-[#0052CC] hover:text-white text-xl px-10">
                  Watch Demo
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Your other sections go here — keep them as-is */}
        {/* Benefits, Why Choose, How It Works, Testimonials, Footer */}
      </div>
    </>
  );
}