'use client';

import Image from 'next/image';
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

// Adjust import path if needed
import { buildGs1ElementString, buildSsccGs1String } from '@/lib/gs1Builder';

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
  payload?: string;
  fields?: Gs1Fields;
  sscc?: string; // For SSCC (AI 00) container labels
  codeType?: CodeType;
  size?: number;
  filename?: string;
  showText?: boolean;
  className?: string;
};

export default function GenerateLabel({
  payload: payloadProp,
  fields,
  sscc,
  codeType = 'QR',
  size = 300,
  filename = 'label.png',
  showText = true,
  className
}: GenerateLabelProps) {
  const [payload, setPayload] = useState<string>(payloadProp ?? '');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payloadProp && sscc) {
      // Build SSCC (AI 00) payload for container labels
      try {
        const built = buildSsccGs1String(sscc);
        setPayload(built);
      } catch (e: any) {
        setError(`Failed to build SSCC payload: ${e?.message ?? String(e)}`);
      }
    } else if (!payloadProp && fields) {
      // Build product (AI 01) payload
      try {
        const built = buildGs1ElementString(fields);
        setPayload(built);
      } catch (e: any) {
        setError(`Failed to build GS1 payload: ${e?.message ?? String(e)}`);
      }
    } else if (payloadProp) {
      setPayload(payloadProp);
    }
  }, [payloadProp, fields, sscc]);

  useEffect(() => {
    if (!payload) return;

    setError(null);
    setQrDataUrl(null);

    if (codeType === 'QR') {
      QRCode.toDataURL(payload, { margin: 1, width: size })
        .then((url) => setQrDataUrl(url))
        .catch((err) =>
          setError('Failed to render QR: ' + (err?.message || String(err)))
        );
      return;
    }

    if (codeType === 'DATAMATRIX') {
      (async () => {
        try {
          const bwipjs = (await import('bwip-js')).default ?? (await import('bwip-js'));
          const canvas = canvasRef.current;
          if (!canvas) throw new Error('Canvas not ready');

          bwipjs.toCanvas(canvas, {
            bcid: 'datamatrix',
            text: payload,
            scale: 2,
            includetext: false
          });
        } catch (err: any) {
          setError('Failed to render DataMatrix: ' + (err?.message || String(err)));
        }
      })();
      return;
    }
  }, [payload, codeType, size]);

  async function downloadImage() {
    if (codeType === 'QR') {
      if (!qrDataUrl) return;
      const a = document.createElement('a');
      a.href = qrDataUrl;
      a.download = filename;
      a.click();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const humanReadable = fields
    ? [
        ['GTIN', fields.gtin],
        ['MFD(YYMMDD)', fields.mfdYYMMDD ?? ''],
        ['EXP(YYMMDD)', fields.expiryYYMMDD ?? ''],
        ['Batch', fields.batch ?? ''],
        ['MRP', fields.mrp ?? ''],
        ['SKU', fields.sku ?? '']
      ]
    : [['Payload', payload]];

  return (
    <div className={className}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #eee',
          marginBottom: 10
        }}
      >
        {error ? (
          <div style={{ color: 'crimson' }}>{error}</div>
        ) : codeType === 'QR' ? (
          qrDataUrl ? (
            <Image
              src={qrDataUrl}
              alt="QR Code"
              width={size}
              height={size}
              unoptimized
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <div>Rendering QR...</div>
          )
        ) : (
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            style={{ width: size, height: size }}
          />
        )}
      </div>

      <button
        onClick={downloadImage}
        style={{
          padding: '8px 12px',
          borderRadius: 6,
          background: '#111827',
          color: 'white',
          border: 0,
          cursor: 'pointer',
          marginBottom: 10
        }}
      >
        Download PNG
      </button>

      {showText && (
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
          {humanReadable.map(([label, value]) => (
            <div key={label} style={{ marginBottom: 4 }}>
              <strong>{label}:</strong> {value}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
