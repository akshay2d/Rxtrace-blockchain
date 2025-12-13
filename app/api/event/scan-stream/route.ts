// app/api/events/scan-stream/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const dynamic = 'force-dynamic';

// Helper: format SSE record
function sseEvent(data: any, event = "message") {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: Request) {
  let closed = false;
  
  // We'll stream via ReadableStream and poll DB for new scan transactions.
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // send a welcome ping
        controller.enqueue(new TextEncoder().encode(sseEvent({ ok: true, msg: "stream-open" }, "open")));

        let lastIdSeen: string | null = null; // track last billing_transactions.id we sent
        // initialize lastIdSeen to the most recent id
        try {
          const last = await prisma.billing_transactions.findFirst({
            where: { type: "scan" },
            orderBy: { created_at: "desc" },
            select: { id: true },
          });
          lastIdSeen = last?.id ?? null;
        } catch (e) {
          // ignore — continue with null
          lastIdSeen = null;
        }

        // polling loop
        let closed = false;
        const poll = async () => {
          if (closed) return;
          try {
            const rows = await prisma.billing_transactions.findMany({
              where: { type: "scan" },
              orderBy: { created_at: "asc" },
              // get rows newer than lastIdSeen — if null, get last 20
              take: lastIdSeen ? undefined : 20,
            });

            // if lastIdSeen set, filter after fetching (safer across DBs)
            const newRows = lastIdSeen ? rows.filter((r) => r.id > lastIdSeen!) : rows;

            for (const row of newRows) {
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
