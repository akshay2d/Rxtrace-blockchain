import { supabase } from "@/lib/supabase";
import { generateUnitGS1, generateSSCC } from "@/lib/gs1";
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
    const gs1 = generateUnitGS1({
      gtin, exp, mfd, batch,
      serial, mrp,
      sku: sku.code,
      company: company.code
    });

    await supabase.from("labels_units").insert({
      job_id: job.id,
      gs1_payload: gs1,
      serial
    });
  }

  const sscc = generateSSCC(company.prefix, generateSerial(job.id));
  await supabase.from("labels_pallets").insert({
    job_id: job.id,
    sscc
  });

  return NextResponse.json({ job_id: job.id });
}
