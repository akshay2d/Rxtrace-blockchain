import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  // 1) Pallet
  const pallet = await prisma.pallet.findUnique({
    where: { sscc: code },
    include: { cartons: { include: { boxes: { include: { units: true } } } } }
  });
  if (pallet) return NextResponse.json({ type: "pallet", data: pallet });

  // 2) Carton
  const carton = await prisma.carton.findUnique({
    where: { sscc: code },
    include: { pallet: true, boxes: { include: { units: true } } }
  });
  if (carton) return NextResponse.json({ type: "carton", data: carton });

  // 3) Box
  const box = await prisma.box.findUnique({
    where: { sscc: code },
    include: { carton: { include: { pallet: true } }, units: true }
  });
  if (box) return NextResponse.json({ type: "box", data: box });

  // 4) Unit
  const unit = await prisma.unit.findUnique({
    where: { uid: code },
    include: { box: { include: { carton: { include: { pallet: true } } } } }
  });
  if (unit) return NextResponse.json({ type: "unit", data: unit });

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
