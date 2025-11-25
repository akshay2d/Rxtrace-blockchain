'use client';

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type Result } from "@zxing/library";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const codeReader = new BrowserQRCodeReader();

    if (videoRef.current && scanning) {
      codeReader.decodeFromVideoDevice(
        null, // ← This was the undefined error — changed to null
        videoRef.current,
        async (scanResult: Result | undefined, error?: Error) => {
          if (scanResult && scanning) {
            setScanning(false);
            setLoading(true);
            const text = scanResult.getText() || "";

            try {
              const res = await fetch("/api/verify-private", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: text }),
              });
              const data = await res.json();
              setResult(data);
            } catch (e) {
              setResult({ verified: false });
            }
            setLoading(false);
          }
        }
      );
    }

    return () => codeReader.reset();
  }, [scanning]);

  const reset = () => {
    setResult(null);
    setScanning(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold text-white mb-8 text-center">RxTrace Scanner</h1>

      {!result ? (
        <div className="relative w-full max-w-md">
          <video ref={videoRef} className="w-full rounded-2xl shadow-2xl" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
              <Loader2 className="w-12 h-12 animate-spin text-cyan-400" />
            </div>
          )}
          <p className="text-center text-white mt-4">Point camera at QR/Barcode</p>
        </div>
      ) : (
        <Card className={`p-10 max-w-md w-full text-center ${result.verified ? "bg-green-900/30 border-green-500" : "bg-red-900/30 border-red-500"}`}>
          {result.verified ? (
            <>
              <CheckCircle2 className="w-24 h-24 text-green-400 mx-auto mb-6" />
              <h2 className="text-4xl font-bold text-green-400 mb-6">VERIFIED</h2>
              <div className="space-y-3 text-left text-white">
                <p><strong>Product:</strong> {result.product || "Unknown"}</p>
                <p><strong>Batch:</strong> {result.batch || "N/A"}</p>
                <p><strong>MFD:</strong> {result.mfd || "N/A"}</p>
                <p><strong>Exp:</strong> {result.expiry || "N/A"}</p>
                <p><strong>MRP:</strong> ₹{result.mrp || "0.00"}</p>
              </div>
              <p className="mt-8 text-cyan-300 font-semibold">
                Verified by RxTrace → www.rxtrace.in
              </p>
            </>
          ) : (
            <>
              <XCircle className="w-24 h-24 text-red-400 mx-auto mb-6" />
              <h2 className="text-4xl font-bold text-red-400 mb-6">NOT A RxTrace CODE</h2>
              <p className="text-white text-lg">Use official RxTrace scanner for genuine verification</p>
              <p className="mt-6 text-cyan-300 font-semibold">www.rxtrace.in</p>
            </>
          )}

          <Button onClick={reset} className="mt-10 w-full bg-cyan-400 hover:bg-cyan-300 text-black font-bold">
            Scan Another
          </Button>
        </Card>
      )}
    </div>
  );
}