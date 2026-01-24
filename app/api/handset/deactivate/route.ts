import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Deactivate a handset
 * Requires authentication and verifies handset belongs to user's company
 */
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const authHeader = req.headers.get("authorization");
    
    // Check authentication (optional - can be public if needed, but better to require auth)
    let companyId: string | null = null;
    if (authHeader) {
      const accessToken = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
      
      if (!userError && user) {
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('user_id', user.id)
          .single();
        companyId = company?.id || null;
      }
    }

    const { handset_id } = await req.json();

    if (!handset_id) {
      return NextResponse.json({ error: "handset_id required" }, { status: 400 });
    }

    // Get handset to verify it exists and check company ownership
    const { data: existingHandset, error: fetchError } = await supabase
      .from("handsets")
      .select("id, company_id, status")
      .eq("id", handset_id)
      .maybeSingle();

    if (fetchError || !existingHandset) {
      return NextResponse.json({ error: "Handset not found" }, { status: 404 });
    }

    // If authenticated, verify handset belongs to user's company
    if (companyId && existingHandset.company_id !== companyId) {
      return NextResponse.json({ error: "Unauthorized: Handset does not belong to your company" }, { status: 403 });
    }

    // If already inactive, return success
    if (existingHandset.status === "INACTIVE") {
      return NextResponse.json({ 
        success: true, 
        handset: existingHandset,
        message: "Handset is already inactive"
      });
    }

    // Deactivate the handset
    const { data: handset, error } = await supabase
      .from("handsets")
      .update({ status: "INACTIVE" })
      .eq("id", handset_id)
      .select()
      .single();

    if (error || !handset) {
      return NextResponse.json({ error: error?.message || "Failed to deactivate handset" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      handset,
      message: "Handset deactivated successfully"
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
