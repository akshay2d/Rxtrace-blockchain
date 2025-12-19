import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { company_id, status } = await req.json();

    if (!company_id || !status) {
      return NextResponse.json(
        { error: "company_id and status are required" },
        { status: 400 }
      );
    }

    if (!["ACTIVE", "FROZEN"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be ACTIVE or FROZEN" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("company_wallets")
      .upsert({
        company_id,
        status,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Company ${status === "FROZEN" ? "frozen" : "activated"} successfully`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update status" },
      { status: 500 }
    );
  }
}
