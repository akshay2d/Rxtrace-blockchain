import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ---------- utils ----------
const pad2 = (n: number) => n.toString().padStart(2, "0");

const toYYMMDD = (d: string | Date) => {
  const dt = new Date(d);
  return (
    dt.getFullYear().toString().slice(-2) +
    pad2(dt.getMonth() + 1) +
    pad2(dt.getDate())
  );
};

const generateSerial = (companyId: string) =>
  `U${companyId.slice(0, 4)}${Date.now().toString(36)}${crypto
    .randomBytes(3)
    .toString("hex")}`;

const buildGS1 = (p: {
  gtin: string;
  expiry: string;
  mfd: string;
  batch: string;
  serial: string;
  mrp: number;
  sku: string;
  company: string;
}) =>
  `(01)${p.gtin}` +
  `(17)${toYYMMDD(p.expiry)}` +
  `(11)${toYYMMDD(p.mfd)}` +
  `(10)${p.batch}` +
  `(21)${p.serial}` +
  `(91)${p.mrp.toFixed(2)}` +
  `(92)${p.sku}` +
  `(93)${p.company}`;

// ---------- API ----------
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const {
      company_id,
      company_name,
      sku_code,
      sku_name,
      gtin,
      batch,
      mfd,
      expiry,
      mrp,
      quantity
    } = body;

    if (
      !company_id ||
      !sku_code ||
      !gtin ||
      !batch ||
      !mfd ||
      !expiry ||
      mrp === undefined ||
      !quantity
    ) {
      return NextResponse.json(
        { error: "Invalid / missing fields" },
        { status: 400 }
      );
    }

    // ---------- SKU UPSERT ----------
    const { data: sku, error: skuErr } = await supabase
      .from("skus")
      .upsert(
        {
          company_id,
          sku_code,
          sku_name
        },
        { onConflict: "company_id,sku_code" }
      )
      .select("id")
      .single();

    if (skuErr || !sku) throw skuErr;

    // ---------- UNIT GENERATION ----------
    const rows = Array.from({ length: quantity }).map(() => {
      const serial = generateSerial(company_id);

      return {
        company_id,
        sku_id: sku.id,
        gtin,
        batch,
        mfd,
        expiry,
        mrp,
        serial,
        gs1_payload: buildGS1({
          gtin,
          expiry,
          mfd,
          batch,
          serial,
          mrp: Number(mrp),
          sku: sku_code,
          company: company_name || ""
        })
      };
    });

    const { error } = await supabase.from("labels_units").insert(rows);
    if (error) throw error;

    return NextResponse.json({
      success: true,
      generated: rows.length
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unit generation failed" },
      { status: 500 }
    );
  }
}
