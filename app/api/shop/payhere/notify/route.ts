import { NextRequest, NextResponse } from "next/server";
import { PaymentProvider } from "@/app/generated/prisma/enums";
import { verifyPayHereNotification } from "@/lib/payhere";
import { cancelCheckout, completeCheckout } from "@/lib/shop";
import { audit } from "@/utils/audit";
import { handleError } from "@/utils/handleError";
import { toCents } from "@/utils/money";

// PayHere calls this (notify_url) when a payment succeeds, fails or is
// charged back. Form-encoded, no login: the md5sig made with our merchant
// secret proves the message is from PayHere. It must be reachable from the
// internet - PayHere cannot call localhost (see PAYHERE_NOTIFY_URL in .env).
//   status_code: 2 success, 0 pending, -1 cancelled, -2 failed, -3 charged back
export async function POST(request: NextRequest) {
  let form: Record<string, string>;
  try {
    const data = await request.formData();
    form = Object.fromEntries(
      [...data.entries()].map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return NextResponse.json({ message: "Expected form data" }, { status: 400 });
  }

  try {
    if (!verifyPayHereNotification(form)) {
      console.error(`PayHere notification with a wrong signature for ${form.order_id}`);
      return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
    }

    const checkoutReference = form.order_id;
    switch (form.status_code) {
      case "2":
        await completeCheckout(checkoutReference, {
          provider: PaymentProvider.PAYHERE,
          amountCents: toCents(form.payhere_amount), // exactly as PayHere sent it
          currency: form.payhere_currency,
          providerReference: form.payment_id,
        });
        break;
      case "-1":
      case "-2":
        await cancelCheckout(
          checkoutReference,
          form.status_code == "-1" ? "Payment cancelled" : `Payment failed: ${form.status_message ?? ""}`.trim(),
        );
        break;
      case "-3":
        // the card holder disputed a paid payment with their bank
        await audit({
          action: "payment.chargeback",
          entityType: "PAYMENT",
          details: { checkoutReference, paymentId: form.payment_id, provider: "PAYHERE" },
        });
        console.error(`PayHere chargeback on ${checkoutReference} (${form.payment_id})`);
        break;
      // "0" pending: wait for the next notification
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    return handleError(error);
  }
}
