import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/app/lib/prisma";

const SCAN_COST: Record<string, number> = {
  unit: 0,
  box: 0.2,
  carton: 1,
  pallet: 4,
};

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth) return NextResponse.json({ success: false, error: "No auth token" }, { status: 401 });

    const token = auth.replace("Bearer ", "");
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    const { role, company_id, handset_id } = decoded;

    const { scannedValue, scanType } = await req.json();
    if (!scanType || !scannedValue)
      return NextResponse.json({ success: false, error: "scanType & scannedValue required" });

    // 🔒 Permission enforcement
    if (role === "UNIT_ONLY" && scanType !== "unit") {
      return NextResponse.json({
        success: false,
        error: "Activation required for box/carton/pallet scanning",
      }, { status: 403 });
    }

    const amount = SCAN_COST[scanType] ?? 0;

    // 💰 Billing + scan log (atomic)
    await prisma.$transaction(async (tx) => {
      // Wallet check
      const wallet = await tx.company_wallets.findUnique({ where: { company_id } });
      const balance = Number(wallet?.balance ?? 0);
      const credit = Number(wallet?.credit_limit ?? 0);

      if (amount > 0 && balance + credit < amount) {
        throw new Error("Insufficient balance");
      }

      // Deduct balance
      if (amount > 0) {
        await tx.company_wallets.update({
          where: { company_id },
          data: { balance: balance - amount },
        });

        await tx.billing_transactions.create({
          data: {
            company_id,
            type: "scan",
            subtype: scanType,
            count: 1,
            amount,
            balance_after: balance - amount,
          },
        });
      }

      // Store scan event
      await tx.scan_events.create({
        data: {
          company_id,
          handset_id,
          scan_value: scannedValue,
          scan_type: scanType,
        },
      });
    });

    return NextResponse.json({
      success: true,
      scanType,
      charged: amount,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || String(err) },
      { status: 400 }
    );
  }
}
