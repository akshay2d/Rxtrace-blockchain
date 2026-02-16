import { NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { requireUserSession } from "@/lib/auth/session";

const MAX_TOKENS_PER_USER = 10;
const TOKEN_ATTEMPTS = 5;

function buildTokenNumber() {
  const randomDigits = crypto.randomInt(0, 1000000);
  return `RX-${randomDigits.toString().padStart(6, "0")}`;
}

export async function POST(req: Request) {
  try {
    const auth = await requireUserSession();
    if ("error" in auth) return auth.error;

    const userId = auth.userId;
    const activeTokens = await prisma.token.count({
      where: {
        userId,
        status: "ACTIVE",
      },
    });

    if (activeTokens >= MAX_TOKENS_PER_USER) {
      return NextResponse.json(
        { success: false, error: `Maximum of ${MAX_TOKENS_PER_USER} active tokens reached` },
        { status: 400 }
      );
    }

    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt++) {
      const tokenNumber = buildTokenNumber();
      try {
        const token = await prisma.token.create({
          data: {
            userId,
            tokenNumber,
            expiry,
          },
        });

        return NextResponse.json({
          success: true,
          token: token.tokenNumber,
          generatedAt: token.generatedAt.toISOString(),
          expiry: token.expiry.toISOString(),
          status: token.status,
          activationCount: token.activationCount,
          maxActivations: token.maxActivations,
        });
      } catch (err: any) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue;
        }
        throw err;
      }
    }

    return NextResponse.json(
      { success: false, error: "Failed to generate a unique token, please retry" },
      { status: 500 }
    );
  } catch (error: any) {
    console.error("Generate token error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate token" },
      { status: 500 }
    );
  }
}
