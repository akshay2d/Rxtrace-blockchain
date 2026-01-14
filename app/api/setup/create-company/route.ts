import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { user_id, company_name, gst_number, contact_email, contact_phone, address } = await req.json();

    if (!user_id || !company_name) {
      return NextResponse.json(
        { error: "user_id and company_name are required" },
        { status: 400 }
      );
    }

    // Check if company already exists
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Company already exists for this user", company_id: existing.id },
        { status: 400 }
      );
    }

    // Create company
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        user_id,
        company_name,
        gst_number: gst_number || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        address: address || null,
      })
      .select()
      .single();

    if (companyError) {
      throw companyError;
    }

    // Auto-create the owner seat as ACTIVE. Starter plan includes 1 seat and
    // the owner should not need an invite.
    try {
      const ownerEmail = String(contact_email ?? '').trim().toLowerCase();
      const { data: existingSeat } = await supabase
        .from('seats')
        .select('id')
        .eq('company_id', company.id)
        .or(`user_id.eq.${user_id},email.eq.${ownerEmail}`)
        .maybeSingle();

      if (!existingSeat) {
        const now = new Date().toISOString();
        await supabase
          .from('seats')
          .insert({
            company_id: company.id,
            user_id,
            email: ownerEmail || null,
            role: 'admin',
            active: true,
            status: 'active',
            invited_at: now,
            activated_at: now,
            created_at: now,
          });
      }
    } catch (seatError) {
      console.error('Failed to auto-create owner seat:', seatError);
    }

    // Auto-create wallet with ₹0 balance
    const { error: walletError } = await supabase
      .from("company_wallets")
      .insert({
        company_id: company.id,
        balance: 0,
        status: "ACTIVE",
      });

    if (walletError) {
      console.error("Failed to create wallet:", walletError);
      // Don't fail the whole operation, wallet can be created later
    }

    return NextResponse.json({
      success: true,
      company,
      message: "Company and wallet created successfully!",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create company" },
      { status: 500 }
    );
  }
}
