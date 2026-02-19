import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type Context = {
  params: {
    id: string;
  };
};

export const dynamic = "force-dynamic";

function normalizeRole(role: unknown): string {
  return String(role ?? "").trim().toLowerCase();
}

export async function DELETE(_req: NextRequest, context: Context) {
  try {
    const companyId = context.params.id;
    if (!companyId || !UUID_REGEX.test(companyId)) {
      return NextResponse.json(
        { error: "Valid company id is required" },
        { status: 400 }
      );
    }

    const supabase = await supabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: adminRow, error: adminError } = await admin
      .from("admin_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError) {
      return NextResponse.json(
        { error: `Failed to verify admin role: ${adminError.message}` },
        { status: 500 }
      );
    }

    if (!adminRow || normalizeRole(adminRow.role) !== "superadmin") {
      return NextResponse.json(
        { error: "Forbidden: superadmin access required" },
        { status: 403 }
      );
    }

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id, company_name")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) {
      throw companyError;
    }
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const { error: deleteError } = await admin
      .from("companies")
      .delete()
      .eq("id", companyId);

    if (deleteError) {
      const status = deleteError.code === "23503" ? 409 : 500;
      return NextResponse.json(
        {
          error:
            status === 409
              ? "Company cannot be deleted because related records exist"
              : deleteError.message,
          code: deleteError.code,
        },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Company deleted successfully",
      company_id: companyId,
      company_name: company.company_name,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to delete company" },
      { status: 500 }
    );
  }
}
