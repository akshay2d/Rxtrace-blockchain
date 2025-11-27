'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Mail, 
  Phone, 
  MapPin, 
  ArrowRight, 
  Pill 
} from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <>
      <div className="min-h-screen bg-white">
        {/* Header / Navbar */}
        <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div className="container mx-auto px-4">
            <div className="flex h-16 items-center justify-between">
              <div className="flex items-center gap-3">
                <Pill className="h-8 w-8 text-orange-500" />
                <span className="text-2xl font-bold text-[#0052CC]">RxTrace India</span>
              </div>

              <nav className="hidden md:flex items-center gap-8">
                {['Home', 'Features', 'How it Works', 'Pricing', 'Contact'].map((item) => (
                  <a
                    key={item}
                    href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                    className="text-gray-700 hover:text-[#0052CC] font-medium transition-colors"
                  >
                    {item}
                  </a>
                ))}
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

        {/* Hero Section */}
        <section className="py-24 lg:py-32">
          <div className="container mx-auto px-4 text-center">
            <Badge className="mb-6 bg-orange-100 text-orange-600 text-lg px-4 py-2">
              India's First Pharma Traceability Platform
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
        </section>

        {/* Benefits Section */}
        <section id="features" className="py-20 bg-gradient-to-b from-gray-50 to-white">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: QrCode, title: "Get Real GS1-Compliant Codes Instantly", desc: "Generate authentic GTINs, SSCCs and serialised codes in seconds" },
                { icon: ShieldCheck, title: "Protect Your Brand from Fake & Duplicate Products", desc: "Every scan proves authenticity and tracks the supply chain journey" },
                { icon: CheckCircle, title: "30-Day Free Trial – Up to 1000 Labels Free", desc: "No credit card required. Start protecting your medicines today" },
              ].map((item, i) => (
                <Card key={i} className="h-full bg-white/80 backdrop-blur border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
                  <CardHeader>
                    <div className="p-4 w-16 h-16 bg-gradient-to-br from-[#0052CC] to-indigo-700 rounded-2xl flex items-center justify-center mb-4">
                      <item.icon className="h-9 w-9 text-white" />
                    </div>
                    <CardTitle className="text-2xl">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-lg text-gray-600">{item.desc}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Why Choose Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Why Choose RxTrace India</h2>
              <p className="text-xl text-gray-600">Built for manufacturers, trusted by patients</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: Smartphone, title: "Instant Verification for Everyone", desc: "Download RxTrace App & Scan Any QR/Barcode/DataMatrix → Instant Verification" },
                { icon: HeartHandshake, title: "Save Children & Loved Ones from Fake Medicines", desc: "Give families peace of mind with one simple scan" },
                { icon: Users, title: "Completely Free for Patients & Consumers Forever", desc: "No registration, no cost, no limits – verification for all" },
              ].map((item, i) => (
                <Card key={i} className="h-full text-center bg-gradient-to-br from-orange-50 to-white border-0 shadow-lg">
                  <CardHeader>
                    <div className="mx-auto p-4 w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center mb-4">
                      <item.icon className="h-10 w-10 text-white" />
                    </div>
                    <CardTitle className="text-2xl">{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-lg text-gray-700">{item.desc}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-20 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">How It Works</h2>
              <p className="text-xl text-gray-600">Simple, powerful, compliant</p>
            </div>
            <div className="grid md:grid-cols-4 gap-8">
              {[
                { step: "01", icon: Package, title: "Sign up & get your GS1 prefix", desc: "Instant approval and allocation" },
                { step: "02", icon: QrCode, title: "Generate labels (single or bulk CSV)", desc: "Serialised, unique codes every time" },
                { step: "03", icon: Download, title: "Print on packaging (PDF/PNG/ZPL)", desc: "Ready for any printer or label supplier" },
                { step: "04", icon: Smartphone, title: "Anyone scans → instantly sees authentic product info", desc: "Patients, pharmacies & regulators trust every scan" },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <div className="text-6xl font-bold text-orange-500 mb-4">{item.step}</div>
                  <div className="mx-auto w-20 h-20 bg-[#0052CC] rounded-full flex items-center justify-center mb-6">
                    <item.icon className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                  <p className="text-gray-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="py-20 bg-gradient-to-b from-white to-gray-50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Trusted by Indian Pharma Leaders</h2>
              <p className="text-xl text-gray-600">Real manufacturers, real results</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {[
                {
                  name: "Dr. Rajesh Kumar",
                  role: "CEO, MedLife Pharmaceuticals",
                  avatar: "RK",
                  text: "RxTrace saved us from a major counterfeit scare. Within 24 hours of launching, we caught 3 fake batches in the market. Game changer!",
                },
                {
                  name: "Priya Sharma",
                  role: "Supply Chain Head, CureWell Ltd.",
                  avatar: "PS",
                  text: "Finally a solution that actually works with our Zebra printers. ZPL output is perfect, and bulk CSV upload handles 5000+ labels in seconds.",
                },
                {
                  name: "Amit Patel",
                  role: "Director, Apex Drugs",
                  avatar: "AP",
                  text: "Patients are calling us to say thank you. They scan the QR and feel safe buying our medicines. That trust is priceless.",
                },
              ].map((t, i) => (
                <Card key={i} className="h-full bg-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
                  <CardContent className="p-8">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-14 h-14 bg-gradient-to-br from-[#0052CC] to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
                        {t.avatar}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{t.name}</h3>
                        <p className="text-sm text-gray-600">{t.role}</p>
                      </div>
                    </div>
                    <p className="text-gray-700 text-lg leading-relaxed italic">"{t.text}"</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-[#0052CC] text-white">
          <div className="container mx-auto px-4 py-16">
            <div className="grid md:grid-cols-3 gap-12">
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <Pill className="h-8 w-8 text-orange-400" />
                  <span className="text-2xl font-bold">RxTrace India</span>
                </div>
                <p className="text-gray-300 max-w-sm">
                  India's trusted pharmaceutical traceability platform protecting brands and patients from counterfeit medicines.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-2 gap-8 text-sm">
                <div>
                  <h4 className="font-semibold mb-4">Quick Links</h4>
                  <ul className="space-y-2 text-gray-300">
                    <li><a href="#home" className="hover:text-orange-400 transition">Home</a></li>
                    <li><a href="#features" className="hover:text-orange-400 transition">Features</a></li>
                    <li><a href="#how-it-works" className="hover:text-orange-400 transition">How it Works</a></li>
                    <li><a href="/pricing" className="hover:text-orange-400 transition">Pricing</a></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-4">Legal</h4>
                  <ul className="space-y-2 text-gray-300">
                    <li><a href="#" className="hover:text-orange-400 transition">Privacy Policy</a></li>
                    <li><a href="#" className="hover:text-orange-400 transition">Terms of Service</a></li>
                  </ul>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-6">Stay Connected</h4>
                <div className="flex gap-4 mb-8">
                  <a href="#" className="hover:text-orange-400 transition"><Twitter className="h-6 w-6" /></a>
                  <a href="#" className="hover:text-orange-400 transition"><Linkedin className="h-6 w-6" /></a>
                  <a href="#" className="hover:text-orange-400 transition"><Youtube className="h-6 w-6" /></a>
                </div>
                <form className="space-y-4">
                  <Input placeholder="Your Name" className="bg-white/10 border-white/20 text-white placeholder:text-gray-400" />
                  <Input placeholder="Your Email" className="bg-white/10 border-white/20 text-white placeholder:text-gray-400" />
                  <Textarea placeholder="Message" rows={3} className="bg-white/10 border-white/20 text-white placeholder:text-gray-400" />
                  <Button className="w-full bg-orange-500 hover:bg-orange-600">Send Message</Button>
                </form>
              </div>
            </div>
            <div className="border-t border-white/10 mt-12 pt-8 text-center text-gray-300">
              <p>© 2025 RxTrace India. Made with ❤️ in India</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}