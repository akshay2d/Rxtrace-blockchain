import { supabase } from "@/lib/supabase";
import { generateCanonicalGS1 } from "@/lib/gs1Canonical";
import { generateSSCC } from "@/lib/gs1";
import { generateSerial } from "@/lib/serial";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();

  const { company, sku, gtin, batch, mfd, exp, mrp,
          quantity, packing_rule_id, printer_id } = body;

  const { data: job } = await supabase
    .from("label_jobs")
    .insert({
      company_id: company.id,
      sku_id: sku.id,
      packing_rule_id,
      printer_id,
      status: "committed"
    })
    .select()
    .single();

  for (let i = 0; i < quantity; i++) {
    const serial = generateSerial(job.id);
    
    // Use canonical GS1 generation (machine format)
    const gs1 = generateCanonicalGS1({
      gtin,
      expiry: exp,
      mfgDate: mfd,
      batch,
      serial,
      mrp: mrp,
      sku: sku.code
    });

    // Insert with all required fields (Priority 1 fix: align with database schema)
    await supabase.from("labels_units").insert({
      company_id: company.id,
      sku_id: sku.id,
      gtin,
      batch,
      mfd,
      expiry: exp,
      mrp: mrp || null,
      serial,
      gs1_payload: gs1
    });
  }

  const sscc = generateSSCC(company.prefix, generateSerial(job.id));
  await supabase.from("labels_pallets").insert({
    job_id: job.id,
    sscc
  });

  return NextResponse.json({ job_id: job.id });
}
