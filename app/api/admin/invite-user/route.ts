import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { canCreateSeat } from "@/lib/usage/seats";
import { sendInvitationEmail } from "@/lib/email";
import { requireAdmin } from "@/lib/auth/admin";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const companyIdFromAuth = await resolveCompanyIdFromRequest(req);
    if (!companyIdFromAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Authenticate user
    const { data: { user }, error: authErr } = await (await supabaseServer()).auth.getUser();
    if (!user || authErr) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { company_id: requestedCompanyId, email, role, message } = await req.json();
    if (requestedCompanyId && requestedCompanyId !== companyIdFromAuth) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const company_id = companyIdFromAuth;

    if (!email || !role) {
      return NextResponse.json(
        { error: "email and role are required" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["admin", "manager", "operator", "viewer"];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be one of: admin, manager, operator, viewer" },
        { status: 400 }
      );
    }

    // Check if user already exists in seats for this company
    const { data: existingSeat } = await supabase
      .from("seats")
      .select("id, status")
      .eq("company_id", company_id)
      .eq("email", email)
      .single();

    if (existingSeat) {
      return NextResponse.json(
        { 
          error: existingSeat.status === "active" 
            ? "User already has an active seat" 
            : "User already invited"
        },
        { status: 400 }
      );
    }

    // Check seat availability
    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", company_id)
      .single();

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Verify user is admin of this company
    if (String((company as any).user_id) !== String(user.id)) {
      const { data: userSeat } = await supabase
        .from("seats")
        .select("role")
        .eq("company_id", company_id)
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();

      if (!userSeat || userSeat.role !== "admin") {
        return NextResponse.json(
          { error: "Forbidden - Admin access required" },
          { status: 403 }
        );
      }
    }

    // Enforce seat limits using subscription system
    const seatCheck = await canCreateSeat(supabase, company_id);
    if (!seatCheck.allowed) {
      return NextResponse.json(
        { 
          error: seatCheck.reason || "User ID limit reached. Upgrade your plan or purchase additional User IDs.",
          requires_payment: true,
          max_seats: seatCheck.max_seats,
          used_seats: seatCheck.used_seats,
          available_seats: seatCheck.available_seats,
        },
        { status: 403 }
      );
    }

    // Create pending seat
    const { data: newSeat, error: seatError } = await supabase
      .from("seats")
      .insert({
        company_id,
        email,
        role,
        status: "pending",
        invited_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (seatError) {
      throw seatError;
    }

    // Send email invitation
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/signup?email=${encodeURIComponent(email)}&company=${company_id}&seat=${newSeat.id}`;
    
    const emailResult = await sendInvitationEmail({
      to: email,
      companyName: (company as any).company_name || 'Company',
      role,
      inviterName: user.user_metadata?.name || user.email || 'Admin',
      customMessage: message,
      inviteUrl,
    });

    if (!emailResult.skipped && !emailResult.success) {
      console.error('Failed to send invitation email:', emailResult.error);
    }

    return NextResponse.json({
      success: true,
      seat: newSeat,
      message: emailResult.skipped 
        ? "Invitation created (email not sent - SMTP not configured)" 
        : "Invitation sent successfully",
      invite_url: emailResult.skipped ? inviteUrl : undefined,
    });
    
  } catch (err: any) {
    console.error("Invite user error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to invite user" },
      { status: 500 }
    );
  }
}
