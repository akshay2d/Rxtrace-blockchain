import { NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

const TOKEN_ATTEMPTS = 5;

function buildActivationToken() {
  const randomDigits = crypto.randomInt(100000, 1000000);
  return `RX-${randomDigits.toString().padStart(6, "0")}`;
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json().catch(() => ({}))) as { company_id?: string };
    const requestedCompanyId = payload.company_id;

    const resolvedCompanyId = await resolveCompanyIdFromRequest(req);
    if (!resolvedCompanyId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (requestedCompanyId && requestedCompanyId !== resolvedCompanyId) {
      return NextResponse.json(
        { success: false, error: "Mismatched company_id" },
        { status: 403 }
      );
    }

    const companyId = requestedCompanyId || resolvedCompanyId;

    const settingsRow = await prisma.company_active_heads.findUnique({
      where: { company_id: companyId },
      select: { heads: true },
    });
    const heads = (settingsRow?.heads as any) ?? {};
    const activationEnabled =
      heads?.scanner_activation_enabled === undefined ? true : Boolean(heads.scanner_activation_enabled);

    if (!activationEnabled) {
      return NextResponse.json(
        { success: false, error: "Activation disabled by admin" },
        { status: 403 }
      );
    }

    for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt++) {
      const token = buildActivationToken();
      try {
        const record = await prisma.handset_tokens.create({
          data: {
            company_id: companyId,
            token,
            high_scan: true,
            used: false,
            disabled: false,
          },
        });

        return NextResponse.json({
          success: true,
          token: record.token,
        });
      } catch (error: any) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }
        throw error;
      }
    }

    return NextResponse.json(
      { success: false, error: "Unable to generate a unique token right now" },
      { status: 500 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate token" },
      { status: 500 }
    );
  }
}
