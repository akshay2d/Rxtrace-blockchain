import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    if (!company_id) return NextResponse.json({ success: false, error: "company_id is required" }, { status: 400 });

    const wallet = await prisma.company_wallets.findUnique({
      where: { company_id },
    });

    const balance = Number(wallet?.balance ?? 0);
    const credit_limit = Number(wallet?.credit_limit ?? 10000);
    const status = wallet?.status ?? "ACTIVE";

    return NextResponse.json({
      success: true,
      company_id,
      balance,
      credit_limit,
      available_credit: balance + credit_limit,
      status,
      freeze: status === "FROZEN",
      updated_at: wallet?.updated_at ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
