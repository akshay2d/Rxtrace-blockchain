// app/api/printers/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side SUPABASE service role client (use env var with SERVICE ROLE KEY)
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  // don't expose this client to browser
  auth: { persistSession: false },
});

// Basic ID validation
function isValidPrinterId(id: string) {
  return /^[A-Z0-9-]{2,20}$/.test(id);
}

// GET: list printers (public or admin; here we return active printers)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('printers')
      .select('id, name, model, location, active, created_at')
      .order('id', { ascending: true });

    if (error) {
      console.error('Supabase GET printers error', error);
      return NextResponse.json({ message: 'Failed to fetch printers' }, { status: 500 });
    }
    return NextResponse.json(data ?? [], { status: 200 });
  } catch (err: any) {
    console.error('GET /api/printers', err);
    return NextResponse.json({ message: err.message || 'Internal error' }, { status: 500 });
  }
}

// POST: bulk upsert printers
export async function POST(req: Request) {
  try {
    // you should enforce auth/roles here in production (see notes)
    const body = await req.json();
    const printers = body?.printers;
    if (!Array.isArray(printers) || printers.length === 0) {
      return NextResponse.json({ message: 'printers array required' }, { status: 400 });
    }

    // normalize & validate
    const rows: any[] = [];
    for (const p of printers) {
      const raw = (p.id || '').toString().toUpperCase().trim();
      if (!isValidPrinterId(raw)) {
        return NextResponse.json({ message: `Invalid printer id: ${raw}` }, { status: 400 });
      }
      rows.push({
        id: raw,
        name: p.name ?? null,
        model: p.model ?? null,
        location: p.location ?? null,
        active: p.active === false ? false : true,
        metadata: p.metadata ?? null,
      });
    }

    // Supabase upsert (onConflict 'id')
    // NOTE: upsert will insert or update rows with matching 'id'
    const { data, error } = await supabase
      .from('printers')
      .upsert(rows, { onConflict: 'id', returning: 'representation' });

    if (error) {
      console.error('Supabase upsert printers error', error);
      return NextResponse.json({ message: error.message || 'Failed to save printers' }, { status: 500 });
    }

    return NextResponse.json(data ?? [], { status: 200 });
  } catch (err: any) {
    console.error('POST /api/printers error', err);
    return NextResponse.json({ message: err.message || 'Invalid request' }, { status: 500 });
  }
}
