import { NextRequest, NextResponse } from "next/server";
import { abandonCheckout, getCheckoutResult, startCheckout } from "@/lib/shop";
import { CheckoutRequestSchema } from "@/types/dto/shop";
import { requireUser } from "@/utils/authentication";
import { handleError } from "@/utils/handleError";
import { searchParam } from "@/utils/params";

// The signed-in customer checks out their cart (see lib/shop.ts).
// { items: [{ itemType: "GEM_ITEM", itemId: "...", quantity: 1 }],
//   paymentMethod: "PAYHERE" | "STRIPE" | "BANK_TRANSFER",
//   delivery: { phone, address, city, country } }
// Returns { redirect } (Stripe, bank transfer) or { form } (PayHere:
// the browser POSTs these fields to PayHere's payment page).
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = CheckoutRequestSchema.parse(await request.json());
    const checkout = await startCheckout(auth.user, body);
    return NextResponse.json(
      { message: "Checkout started", data: checkout },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}

// /api/shop/checkout?checkout=CHK-2026-00001 - the customer cancelled on the
// card payment page; their held items are released at once
export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    await abandonCheckout(auth.user, searchParam(request, "checkout") ?? "");
    return NextResponse.json({ message: "Checkout cancelled" });
  } catch (error) {
    return handleError(error);
  }
}

// /api/shop/checkout?checkout=CHK-2026-00001 - result of a checkout, for the
// thank-you page (with our bank details for a bank transfer)
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const result = await getCheckoutResult(auth.user, searchParam(request, "checkout") ?? "");
    return NextResponse.json({ message: "Checkout fetched", data: result });
  } catch (error) {
    return handleError(error);
  }
}
