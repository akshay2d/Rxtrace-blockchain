import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export async function POST(req: Request) {
  try {
    const payload = (await req.json().catch(() => ({}))) as { token?: string };
    const { token } = payload;

    if (!token) {
      return NextResponse.json({ success: false, error: "token required" }, { status: 400 });
    }

    const companyId = await resolveCompanyIdFromRequest(req);
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tokenRecord = await prisma.handset_tokens.findUnique({
      where: { token },
    });

    if (!tokenRecord || tokenRecord.company_id !== companyId) {
      return NextResponse.json({ success: false, error: "Token not found" }, { status: 404 });
    }

    if (tokenRecord.disabled) {
      return NextResponse.json({ success: true, message: "Token already disabled" });
    }

    await prisma.handset_tokens.update({
      where: { token },
      data: { disabled: true },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to disable token" },
      { status: 500 }
    );
  }
}
