import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { PRICING, type PlanType } from "@/lib/billingConfig";
import { normalizePlanType } from "@/lib/billing/period";
import { sendInvitationEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    // Authenticate user
    const { data: { user }, error: authErr } = await (await supabaseServer()).auth.getUser();
    if (!user || authErr) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { company_id, email, role, message } = await req.json();

    if (!company_id || !email || !role) {
      return NextResponse.json(
        { error: "company_id, email, and role are required" },
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

    // Prefer subscription_plan (source of truth for billing) over legacy columns.
    const planRaw = company?.subscription_plan ?? company?.plan_type ?? company?.plan ?? company?.tier;
    const planType = normalizePlanType(planRaw);
    const extra = Number((company as any)?.extra_user_seats ?? 0);
    const maxSeats = (planType ? PRICING.plans[planType].max_seats : 1) + (Number.isFinite(extra) ? extra : 0);

    const { count: usedSeats, error: usedSeatsError } = await supabase
      .from("seats")
      .select("*", { count: "exact", head: true })
      .eq("company_id", company_id)
      .in("status", ["active", "pending"]);

    if (usedSeatsError) {
      return NextResponse.json({ error: usedSeatsError.message }, { status: 500 });
    }

    if ((usedSeats ?? 0) >= maxSeats) {
      return NextResponse.json(
        { 
          error: "User ID limit reached. Upgrade your plan or purchase additional User IDs.",
          requires_payment: true 
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

    if (emailResult.skipped) {
      console.log('📧 Email skipped (SMTP not configured)');
      console.log(`   Invite URL: ${inviteUrl}`);
    } else if (!emailResult.success) {
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
