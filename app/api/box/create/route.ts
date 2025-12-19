import { NextResponse } from "next/server";

export async function POST(req: Request) {
  return NextResponse.json({ 
    success: false, 
    error: "Box level not yet implemented - missing database schema" 
  }, { status: 501 });
}
