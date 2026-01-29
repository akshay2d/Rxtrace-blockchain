import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { billingConfig } from "@/app/lib/billingConfig";

/**
 * Legacy wallet charge API. Generation flows use subscription-based quota (see Phase 4).
 * Use this only for non-generation charges or until fully deprecated.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { company_id, type, subtype, count = 1 } = body;

    if (!company_id) return NextResponse.json({ success: false, error: "company_id is required" }, { status: 400 });
    if (!type || !subtype) return NextResponse.json({ success: false, error: "type and subtype are required" }, { status: 400 });

    // resolve unit price
    let unitPrice: number | undefined;
    if (type === "scan") unitPrice = (billingConfig.pricing.scan as any)[subtype];
    else if (type === "generation") unitPrice = (billingConfig.pricing.generation as any)[subtype];
    else if (type === "handset") unitPrice = billingConfig.pricing.device.handsetActivationPerMonth;
    else if (type === "seat") unitPrice = billingConfig.pricing.seat.seatAllocationPerMonth;

    if (unitPrice === undefined) return NextResponse.json({ success: false, error: "Invalid type or subtype" }, { status: 400 });

    const totalCost = Number(unitPrice) * Number(count);

    // Atomic check + update + transaction log
    const result = await prisma.$transaction(async (tx: any) => {
      const wallet = await tx.company_wallets.findUnique({ where: { company_id } });

      const balance = Number(wallet?.balance ?? 0);
      const credit_limit = Number(wallet?.credit_limit ?? 10000);
      const status = wallet?.status ?? "ACTIVE";
      const available = balance + credit_limit;

      if (status === "FROZEN") throw new Error("Account is frozen. Billing blocked.");

      if (billingConfig.billingRules.blockOnInsufficientCredits && available < totalCost) {
        const e: any = new Error("Insufficient credit");
        e.code = "INSUFFICIENT";
        e.available = available;
        e.required = totalCost;
        throw e;
      }

      const newBalance = balance - totalCost;

      // Update wallet
      await tx.company_wallets.upsert({
        where: { company_id },
        create: {
          company_id,
          balance: newBalance,
        },
        update: {
          balance: newBalance,
        },
      });

      // Log transaction
      const txRow = await tx.billing_transactions.create({
        data: {
          company_id,
          type,
          subtype,
          count: Number(count),
          amount: totalCost,
          balance_after: newBalance,
        },
      });

      return { newBalance, credit_limit, txId: txRow.id };
    });

    return NextResponse.json({
      success: true,
      message: "Charge applied successfully",
      company_id,
      charged: totalCost,
      balance: result.newBalance,
      available_credit: result.newBalance + result.credit_limit,
      txId: result.txId,
    });
  } catch (err: any) {
    if (err.code === "INSUFFICIENT") {
      return NextResponse.json({
        success: false,
        error: "Insufficient credit",
        available_credit: err.available,
        required: err.required,
      }, { status: 402 });
    }
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
