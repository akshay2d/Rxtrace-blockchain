import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET: List credit notes
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    let query = supabase
      .from("credit_notes")
      .select(`
        *,
        companies!inner(id, company_name),
        users!credit_notes_created_by_fkey(id, email)
      `)
      .order("created_at", { ascending: false });

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query.limit(100);

    if (error) throw error;
    return NextResponse.json({ success: true, credit_notes: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Issue credit note
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, amount, reason } = body;

    if (!company_id || !amount || !reason) {
      return NextResponse.json(
        { success: false, error: "company_id, amount, and reason are required" },
        { status: 400 }
      );
    }

    // Get current user (admin)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: creditNote, error } = await supabase
      .from("credit_notes")
      .insert({
        company_id,
        amount,
        reason,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "CREDIT_NOTE_ISSUED",
      company_id,
      new_value: { credit_note_id: creditNote.id, amount, reason },
      performed_by: user.id,
      performed_by_email: user.email,
    });

    return NextResponse.json({ success: true, credit_note: creditNote });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
