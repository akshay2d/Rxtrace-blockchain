// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "RxTrace India – India's First Pharma Traceability Platform",
  description: "Protect your brand and patients from counterfeit medicines",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans min-h-screen bg-background text-foreground antialiased" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}