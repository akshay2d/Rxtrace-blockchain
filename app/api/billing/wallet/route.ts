import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/app/lib/prisma";
import { calculateTotalUsage } from "@/lib/billingConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

    // Get wallet data
    const { data: walletData, error } = await supabase
      .from("company_wallets")
      .select("company_id, balance, credit_limit, status, updated_at")
      .eq("company_id", company_id)
      .single();

    const wallet = error && error.code === "PGRST116"
      ? { company_id, balance: 0, credit_limit: 10000, status: "ACTIVE" }
      : walletData;

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error }, { status: 500 });
    }

    // Get company name
    const { data: company } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", company_id)
      .single();

    // Calculate current month usage
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

    // Count active handsets
    const handsets = await prisma.handsets.count({
      where: {
        company_id,
        status: "ACTIVE"
      }
    });

    // Count active seats
    const seats = await prisma.seats.count({
      where: {
        company_id,
        active: true
      }
    });

    // Note: Scan tracking tables (box_scans, carton_scans, pallet_scans) don't exist in schema yet
    // Set to 0 until scan tracking is implemented
    const boxScans = 0;
    const cartonScans = 0;
    const palletScans = 0;

    const usage = {
      handsets,
      seats,
      box_scans: boxScans,
      carton_scans: cartonScans,
      pallet_scans: palletScans,
      total: calculateTotalUsage({
        handsets,
        seats,
        box_scans: boxScans,
        carton_scans: cartonScans,
        pallet_scans: palletScans
      })
    };

    return NextResponse.json({
      ...wallet,
      company_name: company?.company_name || null,
      usage
    });
  } catch (err) {
    console.error("Wallet API error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
