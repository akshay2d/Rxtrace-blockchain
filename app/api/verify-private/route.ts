import { NextRequest } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const { code } = await req.json();

  // Look for (91)RXTRACE2025...
  const match = code.match(/\u001d?91RXTRACE2025([A-F0-9]{16})/);
  if (!match) {
    return Response.json({ verified: false });
  }

  const receivedHash = match[1];
  const gs1Without91 = code.split("(91)")[0];
  const expectedHash = crypto
    .createHmac("sha256", "rxtrace2025demo") // Use real company secret in production
    .update(gs1Without91)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();

  const verified = receivedHash === expectedHash;

  if (!verified) {
    return Response.json({ verified: false });
  }

  // Parse GS1 data
  const gtin = code.match(/01(\d{14})/)?.[1] || "N/A";
  const batch = code.match(/10([^\\u001d]*)/)?.[1] || "N/A";
  const mfd = code.match(/15(\d{6})/)?.[1] || "N/A";
  const expiry = code.match(/17(\d{6})/)?.[1] || "N/A";
  const mrpRaw = code.match(/3103(\d{8})/)?.[1] || "00000000";
  const mrp = (parseInt(mrpRaw) / 100).toFixed(2);

  return Response.json({
    verified: true,
    product: "Paracetamol 650mg", // In real app: lookup from DB
    batch,
    mfd: `${mfd.slice(4, 6)}-${mfd.slice(2, 4)}-${mfd.slice(0, 2)}`,
    expiry: `${expiry.slice(4, 6)}-${expiry.slice(2, 4)}-${expiry.slice(0, 2)}`,
    mrp,
  });
}