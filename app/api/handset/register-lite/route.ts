import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/app/lib/prisma";
import { rateLimit } from "@/lib/middleware/rateLimit";
import { validateCompanyOrThrow } from "@/lib/utils/companyValidation";

export async function POST(req: Request) {
  try {
    const { device_fingerprint, company_id } = await req.json();

    // 1. Validate required parameters
    if (!device_fingerprint || !company_id) {
      return NextResponse.json(
        { success: false, error: "device_fingerprint & company_id required" },
        { status: 400 }
      );
    }

    // 2. Rate limiting: Max 10 registrations per device per hour
    if (!rateLimit(device_fingerprint, 10, 60 * 60 * 1000)) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Max 10 registrations per hour per device." },
        { status: 429 }
      );
    }

    // 3. Validate company exists and is active
    let company;
    try {
      company = await validateCompanyOrThrow(company_id);
    } catch (validationError: any) {
      return NextResponse.json(
        { success: false, error: validationError.message || "Invalid company_id. Company not found." },
        { status: 400 }
      );
    }

    // 4. Check for duplicate device fingerprint per company
    // Allow same device for different companies, but prevent duplicate for same company
    const existingHandset = await prisma.handsets.findFirst({
      where: {
        company_id,
        device_fingerprint
      }
    });

    if (existingHandset) {
      // Device already registered for this company - return existing JWT
      const jwtToken = jwt.sign(
        {
          handset_id: existingHandset.id,
          company_id,
          role: "FULL_ACCESS",
          high_scan: existingHandset.high_scan_enabled
        },
        process.env.JWT_SECRET!,
        { expiresIn: "180d" }
      );

      return NextResponse.json({
        success: true,
        jwt: jwtToken,
        high_scan: existingHandset.high_scan_enabled,
        company_id,
        handset_id: existingHandset.id,
        message: "Device already registered for this company"
      });
    }

    // 5. Check registration enabled setting (optional - respect master switch)
    try {
      const settingsRow = await prisma.company_active_heads.findUnique({
        where: { company_id },
        select: { heads: true }
      });
      
      const heads = (settingsRow?.heads as any) ?? {};
      const registrationEnabled =
        heads?.scanner_registration_enabled === undefined ? true : !!heads.scanner_registration_enabled;
      
      if (!registrationEnabled) {
        return NextResponse.json(
          { success: false, error: "Handset registration is disabled for this company" },
          { status: 403 }
        );
      }
    } catch (settingsError) {
      // If settings check fails, continue (default to enabled)
      console.warn("Failed to check registration settings:", settingsError);
    }

    // 6. Create new handset with correct defaults
    const handset = await prisma.handsets.create({
      data: {
        company_id,
        device_fingerprint,
        high_scan_enabled: true, // Full SSCC access
        status: "ACTIVE"
      }
    });

    // 7. Generate JWT with correct payload
    const jwtToken = jwt.sign(
      {
        handset_id: handset.id,
        company_id,
        role: "FULL_ACCESS", // Full access for SSCC scanning
        high_scan: true
      },
      process.env.JWT_SECRET!,
      { expiresIn: "180d" }
    );

    // 8. Return response in correct format
    return NextResponse.json({
      success: true,
      jwt: jwtToken,
      high_scan: true,
      company_id,
      handset_id: handset.id
    });
  } catch (err: any) {
    console.error("Handset registration error:", err);
    
    // Handle unique constraint violation (duplicate device_fingerprint globally)
    if (err.code === 'P2002' && err.meta?.target?.includes('device_fingerprint')) {
      return NextResponse.json(
        { success: false, error: "Device fingerprint already registered for another company" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: err.message || "Registration failed" },
      { status: 500 }
    );
  }
}
