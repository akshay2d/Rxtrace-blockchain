import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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

    // Get current status before update (for audit)
    const { data: currentWallet } = await supabase
      .from("company_wallets")
      .select("status")
      .eq("company_id", company_id)
      .maybeSingle();

    const oldStatus = currentWallet?.status || "ACTIVE";

    // Update wallet status (freeze/unfreeze only - no balance changes)
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

    // Log audit
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("audit_logs").insert({
        action: "COMPANY_FREEZE_TOGGLED",
        company_id,
        old_value: { status: oldStatus },
        new_value: { status },
        performed_by: user?.id || null,
        performed_by_email: user?.email || null,
      });
    } catch (auditErr: any) {
      console.error("Audit log insert failed:", auditErr);
      // Don't fail the freeze operation if audit logging fails
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
