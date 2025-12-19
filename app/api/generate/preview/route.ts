import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { quantity, packingRule } = body;

  const boxes = Math.ceil(quantity / packingRule.units_per_box);
  const cartons = Math.ceil(boxes / packingRule.boxes_per_carton);
  const pallets = Math.ceil(cartons / packingRule.cartons_per_pallet);

  return NextResponse.json({
    units: quantity,
    boxes,
    cartons,
    pallets
  });
}
