// app/page.tsx  ← REPLACE ENTIRE FILE WITH THIS
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-black flex items-center justify-center p-6">
      <Card className="max-w-2xl w-full shadow-2xl border-0">
        <CardHeader className="text-center pb-8">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            RxTrace India
          </h1>
          <p className="text-2xl text-gray-600 dark:text-gray-300 mt-4 font-medium">
            Indian Pharma GS1 Label Generator
          </p>
        </CardHeader>

        <CardContent className="text-center space-y-10">
          <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
            Generate real, scannable GS1-compliant labels with HMAC signature<br />
            <span className="font-semibold">No login • No signup • 100% free</span>
          </p>

          <div className="flex justify-center gap-6 flex-wrap">
            {["QR • DataMatrix • Code128", "PDF • PNG • ZPL • EPL", "CSV Bulk Upload", "Supabase Backend"].map((feature) => (
              <span key={feature} className="bg-blue-100 dark:bg-blue-900/50 px-5 py-3 rounded-full text-sm font-semibold text-blue-800 dark:text-blue-200">
                {feature}
              </span>
            ))}
          </div>

          <Link href="/dashboard/generate">
            <Button size="lg" className="text-xl px-16 py-8 font-bold shadow-lg hover:shadow-xl transition-all">
              Open Label Generator →
            </Button>
          </Link>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Trusted by Indian pharmaceutical manufacturers • Built for compliance
          </p>
        </CardContent>
      </Card>
    </div>
  );
}