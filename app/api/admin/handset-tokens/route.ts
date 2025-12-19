import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const company = await prisma.companies.findFirst({
      where: { user_id: user.id },
      select: { id: true }
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const token = crypto.randomBytes(24).toString("hex");

    const row = await prisma.handset_tokens.create({
      data: {
        company_id: company.id,
        token,
        high_scan: true, // auto-enabled as per your rule
      },
    });

    return NextResponse.json(row);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate token" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const company = await prisma.companies.findFirst({
      where: { user_id: user.id },
      select: { id: true }
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Mark all unused tokens as used (invalidate them)
    const result = await prisma.handset_tokens.updateMany({
      where: {
        company_id: company.id,
        used: false
      },
      data: {
        used: true
      }
    });

    return NextResponse.json({ 
      success: true, 
      invalidated: result.count,
      message: `Invalidated ${result.count} active token(s)` 
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to invalidate tokens" },
      { status: 500 }
    );
  }
}
