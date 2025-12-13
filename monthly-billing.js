// scripts/monthly-billing.js
// Node.js (CommonJS) script — run with `node scripts/monthly-billing.js`

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  console.log(new Date().toISOString(), "Monthly billing started");

  // Fetch all companies that have either handsets or seats active
  // We'll aggregate charges per company and apply atomically.
  const companiesWithHandsets = await prisma.company_handsets.findMany({
    where: { active: true },
    select: { company_id: true, monthly_fee: true },
  });

  const companiesWithSeats = await prisma.company_seats.findMany({
    where: { active: true },
    select: { company_id: true, monthly_fee: true },
  });

  // Build map: company_id -> { handsetTotal, seatTotal }
  const map = new Map();

  for (const h of companiesWithHandsets) {
    const c = map.get(h.company_id) ?? { handsetTotal: 0, seatTotal: 0 };
    c.handsetTotal = (c.handsetTotal || 0) + Number(h.monthly_fee || 0);
    map.set(h.company_id, c);
  }

  for (const s of companiesWithSeats) {
    const c = map.get(s.company_id) ?? { handsetTotal: 0, seatTotal: 0 };
    c.seatTotal = (c.seatTotal || 0) + Number(s.monthly_fee || 0);
    map.set(s.company_id, c);
  }

  // For each company, attempt to charge totalDue = handsetTotal + seatTotal
  const results = [];
  for (const [company_id, totals] of map.entries()) {
    const handsetTotal = Number(totals.handsetTotal || 0);
    const seatTotal = Number(totals.seatTotal || 0);
    const totalDue = Number((handsetTotal + seatTotal).toFixed(2));

    if (totalDue <= 0) {
      results.push({ company_id, status: "skipped", reason: "no due" });
      continue;
    }

    try {
      const outcome = await prisma.$transaction(async (tx) => {
        // fetch wallet
        const wallet = await tx.company_wallets.findUnique({
          where: { company_id },
        });

        const balance = Number(wallet?.balance ?? 0);
        const credit_limit = Number(wallet?.credit_limit ?? 10000);
        const available = balance + credit_limit;
        const status = wallet?.status ?? "ACTIVE";

        if (status === "FROZEN") {
          // already frozen -- log and skip
          const txRow = await tx.billing_transactions.create({
            data: {
              company_id,
              type: "monthly-billing",
              subtype: null,
              count: 1,
              amount: 0,
              balance_after: balance,
            },
          });
          return { ok: false, reason: "already_frozen", txId: txRow.id, balance, available };
        }

        if (available < totalDue) {
          // Not enough funds -> freeze account and log failed transaction
          const newStatus = "FROZEN";
          await tx.company_wallets.update({
            where: { company_id },
            data: { status: newStatus, updated_at: new Date() },
          });

          const txRow = await tx.billing_transactions.create({
            data: {
              company_id,
              type: "monthly-billing",
              subtype: "failed_insufficient",
              count: 1,
              amount: 0,
              balance_after: balance,
            },
          });

          return { ok: false, reason: "insufficient", txId: txRow.id, balance, available };
        }

        // Enough funds -> deduct from balance (allow credit usage)
        const newBalance = balance - totalDue;

        await tx.company_wallets.upsert({
          where: { company_id },
          create: { company_id, balance: newBalance },
          update: { balance: newBalance, updated_at: new Date() },
        });

        const txRow = await tx.billing_transactions.create({
          data: {
            company_id,
            type: "monthly-billing",
            subtype: "success",
            count: 1,
            amount: totalDue,
            balance_after: newBalance,
          },
        });

        return { ok: true, txId: txRow.id, charged: totalDue, balance: newBalance, credit_limit };
      });

      results.push({ company_id, ...outcome });
      console.log(company_id, outcome.ok ? "charged" : "failed", outcome);
    } catch (err) {
      console.error("Error processing", company_id, err);
      // Log failure (best-effort)
      try {
        await prisma.billing_transactions.create({
          data: {
            company_id,
            type: "monthly-billing",
            subtype: "error",
            count: 1,
            amount: 0,
            balance_after: null,
          },
        });
      } catch (e) {
        // ignore
      }
      results.push({ company_id, status: "error", error: String(err) });
    }
  }

  console.log(new Date().toISOString(), "Monthly billing finished", { count: results.length });
  await prisma.$disconnect();
  return results;
}

if (require.main === module) {
  run()
    .then((r) => {
      console.log("Done. Summary:", r.slice(0, 10));
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
