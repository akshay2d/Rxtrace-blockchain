import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { company_id, amount } = body;

    if (!company_id)
      return NextResponse.json({ success: false, error: "company_id is required" }, { status: 400 });

    if (!amount || Number(amount) <= 0)
      return NextResponse.json({ success: false, error: "Invalid top-up amount" }, { status: 400 });

    const amt = Number(amount);

    // Atomic upsert + transaction log
    const result = await prisma.$transaction(async (tx: any) => {
      // fetch existing wallet (for balance_after)
      const wallet = await tx.company_wallets.findUnique({ where: { company_id } });

      const newBalance = (wallet?.balance ?? 0) + amt;

      // upsert wallet row
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

      // create transaction log
      const t = await tx.billing_transactions.create({
        data: {
          company_id,
          type: "topup",
          subtype: null,
          count: 1,
          amount: amt,
          balance_after: newBalance,
        },
      });

      return { newBalance, txId: t.id };
    });

    return NextResponse.json({
      success: true,
      message: "Top-up successful",
      company_id,
      balance: result.newBalance,
      txId: result.txId,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}

