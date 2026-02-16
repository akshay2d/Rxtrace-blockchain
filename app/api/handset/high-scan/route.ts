import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export async function POST(req: Request) {
  try {
    const payload = (await req.json().catch(() => ({}))) as {
      handset_id?: string;
      enabled?: boolean;
    };
    const { handset_id, enabled } = payload;

    if (!handset_id || enabled === undefined) {
      return NextResponse.json(
        { success: false, error: "handset_id and enabled are required" },
        { status: 400 }
      );
    }

    const companyId = await resolveCompanyIdFromRequest(req);
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const handset = await prisma.handsets.findUnique({ where: { id: handset_id } });
    if (!handset || handset.company_id !== companyId) {
      return NextResponse.json({ success: false, error: "Handset not found" }, { status: 404 });
    }

    const updated = await prisma.handsets.update({
      where: { id: handset_id },
      data: { high_scan_enabled: Boolean(enabled) },
    });

    return NextResponse.json({ success: true, handset: updated });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update handset" },
      { status: 500 }
    );
  }
}
