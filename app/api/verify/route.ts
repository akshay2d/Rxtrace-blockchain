// app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // Search in product_batches table by GTIN
    const { data: batch, error } = await supabase
      .from('product_batches')
      .select('*')
      .eq('gtin', code)
      .single();

    if (error || !batch) {
      console.log('Product not found in database');
      return NextResponse.json({
        verified: false,
        rxtraceVerified: false,
        message: 'Product not found in RxTrace database',
        code: code,
      });
    }

    // Product found - it's RxTrace verified!
    return NextResponse.json({
      verified: true,
      rxtraceVerified: true,
      message: 'Verified by RxTrace India ✓',
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
