import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const authCompanyId = await resolveCompanyIdFromRequest(req);
    if (!authCompanyId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const requestedCompanyId = url.searchParams.get("company_id");
    if (requestedCompanyId && requestedCompanyId !== authCompanyId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const company_id = authCompanyId;

    const { data: seats, error } = await supabase
      .from("seats")
      .select("*")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false });
    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, seats: seats ?? [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
