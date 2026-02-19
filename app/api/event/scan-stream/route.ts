// app/api/events/scan-stream/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = 'force-dynamic';

// Helper: format SSE record
function sseEvent(data: any, event = "message") {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: Request) {
  let closed = false;
  const supabase = getSupabaseAdmin();

  // We'll stream via ReadableStream and poll DB for new scan transactions.
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // send a welcome ping
        controller.enqueue(new TextEncoder().encode(sseEvent({ ok: true, msg: "stream-open" }, "open")));

        let lastIdSeen: string | null = null; // track last billing_transactions.id we sent
        // initialize lastIdSeen to the most recent id
        try {
          const { data: last, error: lastError } = await supabase
            .from("billing_transactions")
            .select("id")
            .eq("type", "scan")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastError) throw new Error(lastError.message);
          lastIdSeen = last?.id ?? null;
        } catch (e) {
          // ignore and continue with null
          lastIdSeen = null;
        }

        // polling loop
        let closed = false;
        const poll = async () => {
          if (closed) return;
          try {
            let query = supabase
              .from("billing_transactions")
              .select("*")
              .eq("type", "scan")
              .order("created_at", { ascending: true });

            if (lastIdSeen) {
              query = query.gt("id", lastIdSeen);
            } else {
              query = query.limit(20);
            }

            const { data: newRows, error: rowsError } = await query;
            if (rowsError) throw new Error(rowsError.message);

            for (const row of newRows ?? []) {
              controller.enqueue(new TextEncoder().encode(sseEvent(row, "scan")));
              lastIdSeen = row.id;
            }
          } catch (err) {
            controller.enqueue(new TextEncoder().encode(sseEvent({ error: String(err) }, "error")));
          } finally {
            // schedule next poll
            setTimeout(poll, 2000); // poll every 2s
          }
        };

        // start polling
        poll();
      } catch (err) {
        controller.enqueue(new TextEncoder().encode(sseEvent({ error: String(err) }, "error")));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
