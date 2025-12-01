// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseGS1, formatGS1ForDisplay } from '@/lib/parseGS1';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: 'Code is required', verified: false },
        { status: 400 }
      );
    }

    console.log('Verifying code:', code);

    // Parse GS1 data from scanned code
    const gs1Data = parseGS1(code);
    console.log('Parsed GS1 data:', gs1Data);

    // Try to find product by GTIN (extracted from GS1 or raw code)
    const searchGtin = gs1Data.gtin || code;
    
    const { data: batch, error } = await supabase
      .from('product_batches')
      .select('*')
      .eq('gtin', searchGtin)
      .single();

    if (error || !batch) {
      console.log('Product not found in database for GTIN:', searchGtin);
      return NextResponse.json({
        verified: false,
        rxtraceVerified: false,
        message: 'Product not found in RxTrace database',
        scannedData: gs1Data.parsed ? formatGS1ForDisplay(gs1Data) : code,
        parsedGS1: gs1Data.parsed ? gs1Data : null,
      });
    }

    // Product found - verify batch and expiry if available
    let batchMatch = true;
    let expiryMatch = true;

    if (gs1Data.batchNo && gs1Data.batchNo !== batch.batch_no) {
      batchMatch = false;
      console.warn('Batch mismatch:', gs1Data.batchNo, '!==', batch.batch_no);
    }

    // Create complete display string with database fields + GS1 fields
    // Format: Product Name | MRP | MFG | Expiry | Batch
    const displayParts: string[] = [];
    
    if (batch.sku_name) displayParts.push(`Product: ${batch.sku_name}`);
    if (batch.mrp) displayParts.push(`MRP: ₹${batch.mrp}`);
    if (gs1Data.mfgDate || batch.mfd) displayParts.push(`MFG: ${gs1Data.mfgDate || batch.mfd}`);
    if (gs1Data.expiryDate || batch.expiry) displayParts.push(`Expiry: ${gs1Data.expiryDate || batch.expiry}`);
    if (gs1Data.batchNo || batch.batch_no) displayParts.push(`Batch: ${gs1Data.batchNo || batch.batch_no}`);
    
    const completeDisplay = displayParts.join(' | ');

    // Product found - it's RxTrace verified!
    return NextResponse.json({
      verified: true,
      rxtraceVerified: true,
      batchMatch,
      expiryMatch,
      message: 'Verified by RxTrace India ✓',
      scannedData: completeDisplay,
      parsedGS1: gs1Data.parsed ? gs1Data : null,
      product: {
        companyName: batch.company_name,
        skuName: batch.sku_name,
        gtin: batch.gtin,
        batchNo: batch.batch_no,
        mfgDate: batch.mfd,
        expiryDate: batch.expiry,
        mrp: batch.mrp,
        labelsCount: batch.labels_count,
        generatedAt: batch.generated_at,
      },
    });
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        verified: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET method for testing
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json(
      { error: 'Code parameter is required' },
      { status: 400 }
    );
  }

  // Reuse POST logic
  return POST(
    new NextRequest(request.url, {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  );
}
