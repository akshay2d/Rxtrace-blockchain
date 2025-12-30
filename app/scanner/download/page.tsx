import Link from "next/link";

export default function ScannerDownloadPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="max-w-xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold">Download RxTrace Scanner</h1>
        <p className="mt-3 text-sm text-slate-600">
          Tap the button below to download the Android APK. If Android blocks the install,
          enable “Install unknown apps” for your browser.
        </p>

        <div className="mt-6 flex gap-3">
          <a
            href="/rxtrace-scanner.apk"
            download
            className="inline-flex items-center rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          >
            Download APK
          </a>

          <Link
            href="/"
            className="inline-flex items-center rounded border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
          >
            Back to Home
          </Link>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Note: This is not a Play Store install. Your device may prompt you to confirm the download
          and installation.
        </p>
      </div>
    </main>
  );
}
