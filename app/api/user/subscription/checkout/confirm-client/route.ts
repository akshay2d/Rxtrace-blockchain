import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error: "Client-side payment confirmation is disabled in Phase-2. Payment activation will be implemented in Phase-3.",
    },
    { status: 410 }
  );
}
