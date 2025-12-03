import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

// Adjust this import to your project layout.
// If your canonical builder lives at project root lib/gs1Builder.js or .ts, update path accordingly.
import { buildGs1ElementString } from '@/lib/gs1Builder'; // <-- adjust path if needed

// Define the type locally since gs1Builder.js is JavaScript
type Gs1Fields = {
  gtin: string;
  mfdYYMMDD?: string;
  expiryYYMMDD?: string;
  batch?: string;
  mrp?: string;
  sku?: string;
  company?: string;
};

type CodeType = 'QR' | 'DATAMATRIX';

type GenerateLabelProps = {
  // Provide either `payload` directly (already-built GS1 element string) OR `fields` to build the payload here.
  payload?: string;
  fields?: Gs1Fields;

  // Which code to render
  codeType?: CodeType;

  // Pixel size (QR side / DataMatrix default canvas size usage)
  size?: number;

  // Optional callback when rendered
  onRendered?: (payload: string) => void;

  // Optional filename for downloads
  filename?: string;

  // Optionally show human-readable fields (default true)
  showText?: boolean;

  // CSS className
  className?: string;
};

export default function GenerateLabel({
  payload: payloadProp,
  fields,
  codeType = 'QR',
  size = 300,
  onRendered,
  filename = 'label.png',
  showText = true,
  className
}: GenerateLabelProps) {
  const [payload, setPayload] = useState<string>(payloadProp ?? '');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build payload locally if fields were supplied
  useEffect(() => {
    if (!payloadProp && fields) {
      try {
        const built = buildGs1ElementString(fields);
        setPayload(built);
      } catch (e: any) {
        setError(`Failed to build GS1 payload: ${e?.message ?? String(e)}`);
      }
    } else if (payloadProp) {
      setPayload(payloadProp);
    }
  }, [payloadProp, fields]);

  // Render QR or DataMatrix when payload changes
  useEffect(() => {
    if (!payload) return;

    setError(null);
    setQrDataUrl(null);

    if (codeType === 'QR') {
      // generate QR data URL
      QRCode.toDataURL(payload, { margin: 1, width: size })
        .then((url) => {
          setQrDataUrl(url);
          if (onRendered) onRendered(payload);
        })
        .catch((err) => {
          setError('Failed to render QR: ' + (err && err.message ? err.message : String(err)));
        });
      return;
    }

    // DATAMATRIX via bwip-js (browser)
    // Dynamically import to avoid breaking server-side builds when bwip-js isn't installed
    (async () => {
      try {
        // bwip-js provides a browser build that draws to a canvas:
        // import default from 'bwip-js' in bundlers that support it.
        // Use dynamic require so SSR/builds don't choke.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const BwipJS = (await import('bwip-js')).default ?? (await import('bwip-js'));
        const canvas = canvasRef.current;
        if (!canvas) throw new Error('Canvas not ready');

        // clear canvas
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // bwip-js options for datamatrix
        // Leave scale and padding to bwip, set option msg=payload
        BwipJS.toCanvas(canvas, {
          bcid: 'datamatrix',       // Barcode type
          text: payload,           // Data to encode
          scale: 2,                // 1..n
          includetext: false       // we render human-readable fields separately (lowercase for bwip-js)
        });

        if (onRendered) onRendered(payload);
      } catch (err: any) {
        setError('Failed to render DataMatrix: ' + (err?.message || String(err)));
      }
    })();
  }, [payload, codeType, size, onRendered]);

  async function handleDownload() {
    try {
      if (!payload) return;
      if (codeType === 'QR') {
        if (!qrDataUrl) return;
        // create link and click
        const a = document.createElement('a');
        a.href = qrDataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      // DataMatrix download: draw canvas to blob
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    } catch (err) {
      console.error('Download failed', err);
      setError('Download failed');
    }
  }

  // Human readable fields (if fields were passed, show them; otherwise attempt to parse simple payload)
  const humanLines = React.useMemo(() => {
    if (fields) {
      return [
        { label: 'GTIN', value: fields.gtin },
        { label: 'MFD (YYMMDD)', value: fields.mfdYYMMDD ?? '' },
        { label: 'Expiry (YYMMDD)', value: fields.expiryYYMMDD ?? '' },
        { label: 'Batch', value: fields.batch ?? '' },
        { label: 'MRP', value: fields.mrp ?? '' },
        { label: 'SKU', value: fields.sku ?? '' },
        { label: 'Company', value: fields.company ?? '' }
      ];
    }

    // If no fields provided, try to show payload as a fallback
    return [{ label: 'Payload', value: payload ?? '' }];
  }, [fields, payload]);

  return (
    <div className={className} style={{ display: 'inline-block', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
          {error ? (
            <div style={{ color: 'crimson', padding: 8, textAlign: 'center' }}>{error}</div>
          ) : codeType === 'QR' ? (
            qrDataUrl ? (
              // eslint-disable-next-line jsx-a11y/img-redundant-alt
              <img ref={imgRef} src={qrDataUrl} alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ color: '#666' }}>Rendering QR...</div>
            )
          ) : (
            // DataMatrix: draw to canvas
            <canvas ref={canvasRef} width={size} height={size} style={{ width: '100%', height: '100%' }} />
          )}
        </div>

        <div style={{ minWidth: 220 }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Label preview</div>

          {showText && (
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              {humanLines.map((row) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ color: '#666' }}>{row.label}</div>
                  <div style={{ fontWeight: 600 }}>{row.value}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={handleDownload} style={{ padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#111827', color: '#fff' }}>
              Download PNG
            </button>

            <button
              onClick={() => {
                // copy payload to clipboard
                if (!payload) return;
                navigator.clipboard?.writeText(payload);
              }}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer', background: '#fff' }}
            >
              Copy payload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
