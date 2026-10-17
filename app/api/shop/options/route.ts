import { NextResponse } from "next/server";
import { shopOptions } from "@/lib/shop";

// GET /api/shop/options - the payment methods set up in .env, for the cart page
// { methods: [{ id, label, description, currencies (null = all) }] }
export async function GET() {
  return NextResponse.json({ message: "Shop options", data: shopOptions() });
}
