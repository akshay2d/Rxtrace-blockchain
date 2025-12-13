"use client";

import { useState } from "react";

export default function ScanLookupPage() {
  const [sscc, setSscc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Camera scan helper
  async function startCameraScan() {
    setError(null);
    setScanning(true);
    
    if (!("BarcodeDetector" in window)) {
      setError("BarcodeDetector not supported in this browser.");
      setScanning(false);
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }});
      const video = document.createElement("video");
      video.autoplay = true;
      video.srcObject = stream;
      document.body.appendChild(video); // append temporarily (you can create overlay instead)

      await video.play();
      const detector = new (window as any).BarcodeDetector({ formats: ["code_128","qr_code","data_matrix","ean_13"]});
      const interval = setInterval(async () => {
        try {
          const detections = await detector.detect(video);
          if (detections && detections.length) {
            const code = detections[0].rawValue;
            // stop
            clearInterval(interval);
            stream.getTracks().forEach(t=>t.stop());
            video.remove();
            setSscc(code.replace(/\D/g,'')); // sanitize digits
            setScanning(false);
          }
        } catch (err) { /* ignore detection errors */ }
      }, 300);
    } catch (err: any) {
      setError("Camera access denied or not available: " + String(err));
      setScanning(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 600 }}>
      <h2>Scan Lookup</h2>
      
      <div style={{ marginBottom: 16 }}>
        <label>SSCC / Barcode</label>
        <input 
          value={sscc} 
          onChange={e => setSscc(e.target.value)} 
          placeholder="Enter SSCC or barcode"
          style={{ width: "100%", marginTop: 6, padding: 8 }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <button onClick={startCameraScan}>Scan with Camera</button>
      </div>

      {error && (
        <div style={{ color: "crimson", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {sscc && (
        <div style={{ background: "#f0f0f0", padding: 12, borderRadius: 4 }}>
          <strong>Detected Code:</strong> {sscc}
        </div>
      )}
    </div>
  );
}
