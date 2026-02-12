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
      <body className={`font-sans min-h-screen bg-background text-foreground antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}