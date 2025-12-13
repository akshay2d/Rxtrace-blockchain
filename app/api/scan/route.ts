import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { billingConfig } from "@/app/lib/billingConfig";
import { parseGS1 } from "@/app/lib/gs1Parser"; // your scanner parser

export async function POST(req: Request) {
  try {
    const { raw, handset_id, company_id } = await req.json();

    if (!raw || !handset_id || !company_id)
      return NextResponse.json({ success: false, error: "Missing raw | handset_id | company_id" }, { status: 400 });

    // 1) Check handset activation
    const handset = await prisma.company_handsets.findUnique({ where: { handset_id } });
    if (!handset || !handset.active)
      return NextResponse.json({ success: false, error: "Handset not active" }, { status: 403 });

    // 2) Check active paid head
    const heads = await prisma.company_active_heads.findUnique({ where: { company_id } });
    if (!heads || !heads.heads?.highLevelScan)
      return NextResponse.json({ success: false, error: "Scan module not enabled" }, { status: 403 });

    // 3) Parse GS1 payload
    const data = parseGS1(raw);
    if (!data)
      return NextResponse.json({ success: false, error: "Invalid GS1 payload" }, { status: 400 });

    // 4) Determine type + lookup hierarchy
    let level = "";
    let lookupResult = null;

    if (data.sscc) {
      // Could be pallet/carton/box — check hierarchy from top to bottom.
      lookupResult = await prisma.pallet.findUnique({
        where: { sscc: data.sscc },
        include: { cartons: true },
      });
      if (lookupResult) level = "pallet";

      if (!lookupResult) {
        lookupResult = await prisma.carton.findUnique({
          where: { sscc: data.sscc },
          include: { boxes: true, pallet: true },
        });
        if (lookupResult) level = "carton";
      }

      if (!lookupResult) {
        lookupResult = await prisma.box.findUnique({
          where: { sscc: data.sscc },
          include: { units: true, carton: { include: { pallet: true } } },
        });
        if (lookupResult) level = "box";
      }
    }

    if (!lookupResult && data.uid) {
      // Unit level
      lookupResult = await prisma.unit.findUnique({
        where: { uid: data.uid },
        include: { box: { include: { carton: { include: { pallet: true } } } } },
      });
      if (lookupResult) level = "unit";
    }

    if (!lookupResult)
      return NextResponse.json({ success: false, error: "Code not found in hierarchy" }, { status: 404 });

    // 5) Calculate billing price
    const scanPrice =
      level === "box" ? billingConfig.pricing.scan.box :
      level === "carton" ? billingConfig.pricing.scan.carton :
      level === "pallet" ? billingConfig.pricing.scan.pallet :
      level === "unit" ? 0 : 0; // units scan free (optional)

    // Apply billing (0 = skip)
    if (scanPrice > 0) {
      const billingRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/billing/charge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id,
          type: "scan",
          subtype: level,
          count: 1,
        }),
      });
      const billingJson = await billingRes.json();
      if (!billingJson.success)
        return NextResponse.json({ success: false, error: billingJson.error }, { status: 402 });
    }

    // 6) Success
    return NextResponse.json({
      success: true,
      message: `${level} scanned successfully`,
      level,
      data: lookupResult,
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
