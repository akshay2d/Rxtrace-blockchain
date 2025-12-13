// app/api/admin/bulk-upload/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { makeSscc, makeUnitUid } from "@/app/lib/sscc";
import { billingConfig } from "@/app/lib/billingConfig";

/**
 * POST body (JSON) accepted:
 * {
 *   company_id: string,
 *   level: 'pallet'|'carton'|'box'|'unit',
 *   csv: string,                // CSV content, each row is one record or contains additional columns
 *   parent_column?: string      // optional column name in CSV that references parent SSCC/UID (e.g. 'pallet_sscc' or 'carton_sscc' or 'box_sscc')
 * }
 *
 * CSV simple rules: first row may be header (detected). If header present and parent_column provided, it will be used.
 * If CSV has no header, each line is treated as a single record and parent is ignored.
 */

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { header: null, rows: [] };
  const first = lines[0];
  // detect header if contains non-numeric or commas and letters
  const hasComma = first.includes(",");
  if (hasComma && /[A-Za-z]/.test(first)) {
    const header = first.split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((ln) => ln.split(",").map((c) => c.trim()));
    return { header, rows };
  } else if (hasComma) {
    // no header but comma-separated values
    const rows = lines.map((ln) => ln.split(",").map((c) => c.trim()));
    return { header: null, rows };
  } else {
    // one-value-per-line
    return { header: null, rows: lines.map((v) => [v]) };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { company_id, level, csv, parent_column } = body;
    if (!company_id) return NextResponse.json({ success: false, error: "company_id required" }, { status: 400 });
    if (!level || !["pallet", "carton", "box", "unit"].includes(level)) {
      return NextResponse.json({ success: false, error: "level must be one of pallet|carton|box|unit" }, { status: 400 });
    }
    if (!csv || typeof csv !== "string") {
      return NextResponse.json({ success: false, error: "csv (string) required" }, { status: 400 });
    }

    const { header, rows } = parseCsv(csv);
    if (rows.length === 0) return NextResponse.json({ success: true, created: 0, details: [] });

    const details: any[] = [];
    const unitIsLevel = level === "unit";
    const genPrice = unitIsLevel ? (billingConfig.pricing.generation?.unit ?? 0) : billingConfig.pricing.generation[`${level}SSCC` as any];
    // NOTE: billingConfig currently has boxSSCC/cartonSSCC/palletSSCC

    // Process rows in transaction (batch)
    const results = await prisma.$transaction(async (tx) => {
      let createdCount = 0;
      for (const row of rows) {
        // if header exists, map columns
        const rowObj: Record<string, string> = {};
        if (header) {
          for (let i = 0; i < header.length; i++) rowObj[header[i]] = row[i] ?? "";
        } else {
          rowObj["value"] = row[0] ?? "";
        }

        if (level === "pallet") {
          const sscc = makeSscc();
          await tx.pallet.create({ data: { sscc, company_id } });
          // charge generation
          const amount = Number(billingConfig.pricing.generation.palletSSCC || 0);
          await tx.billing_transactions.create({
            data: { company_id, type: "generation", subtype: "palletSSCC", count: 1, amount, balance_after: (await getAndDecrementBalance(tx, company_id, amount)) },
          });
          details.push({ row: rowObj, sscc, charged: amount });
          createdCount++;
        } else if (level === "carton") {
          const sscc = makeSscc();
          const pallet_id = header && parent_column ? (rowObj[parent_column] || null) : (row[1] || null);
          await tx.carton.create({ data: { sscc, company_id, pallet_id: pallet_id || null } });
          const amount = Number(billingConfig.pricing.generation.cartonSSCC || 0);
          await tx.billing_transactions.create({
            data: { company_id, type: "generation", subtype: "cartonSSCC", count: 1, amount, balance_after: (await getAndDecrementBalance(tx, company_id, amount)) },
          });
          details.push({ row: rowObj, sscc, charged: amount, parent: pallet_id || null });
          createdCount++;
        } else if (level === "box") {
          const sscc = makeSscc();
          const carton_id = header && parent_column ? (rowObj[parent_column] || null) : (row[1] || null);
          await tx.box.create({ data: { sscc, company_id, carton_id: carton_id || null } });
          const amount = Number(billingConfig.pricing.generation.boxSSCC || 0);
          await tx.billing_transactions.create({
            data: { company_id, type: "generation", subtype: "boxSSCC", count: 1, amount, balance_after: (await getAndDecrementBalance(tx, company_id, amount)) },
          });
          details.push({ row: rowObj, sscc, charged: amount, parent: carton_id || null });
          createdCount++;
        } else if (level === "unit") {
          const uid = makeUnitUid();
          const box_id = header && parent_column ? (rowObj[parent_column] || null) : (row[1] || null);
          await tx.unit.create({ data: { uid, company_id, box_id: box_id || null } });
          const amount = 0; // units free by default; change if you want to charge
          if (amount > 0) {
            await tx.billing_transactions.create({
              data: { company_id, type: "generation", subtype: "unit", count: 1, amount, balance_after: (await getAndDecrementBalance(tx, company_id, amount)) },
            });
          }
          details.push({ row: rowObj, uid, charged: amount, parent: box_id || null });
          createdCount++;
        }
      }
      return { createdCount, details };
    });

    return NextResponse.json({ success: true, created: results.createdCount, details: results.details });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}

/**
 * Helper: get current balance, decrement by amount, upsert wallet and return new balance.
 * Uses the provided transaction client tx (Prisma transaction client).
 */
async function getAndDecrementBalance(tx: any, company_id: string, amount: number) {
  const wallet = await tx.company_wallets.findUnique({ where: { company_id } });
  const balance = Number(wallet?.balance ?? 0);
  const credit_limit = Number(wallet?.credit_limit ?? 10000);
  const available = balance + credit_limit;
  if (wallet?.status === "FROZEN") throw new Error("Account frozen");
  if (available < amount) throw new Error("Insufficient credit for generation");
  const newBalance = balance - amount;
  await tx.company_wallets.upsert({
    where: { company_id },
    create: { company_id, balance: newBalance },
    update: { balance: newBalance },
  });
  return newBalance;
}
