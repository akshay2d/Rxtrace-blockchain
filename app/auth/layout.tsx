// app/auth/layout.tsx
import "./auth.css";
import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 flex flex-col">
      {/* Logo Header */}
      <div className="w-full p-6">
        <Link href="/" className="inline-flex items-center gap-2 hover:opacity-80 transition">
          <Image src="/logo.png" alt="RxTrace" width={36} height={36} />
          <span className="font-semibold text-lg text-gray-900">RxTrace</span>
        </Link>
      </div>
      
      {/* Auth Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">{children}</div>
      </div>
    </div>
  );
}