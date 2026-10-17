import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { cancelCheckout, completeStripeSession } from "@/lib/shop";
import { getStripe } from "@/lib/stripe";
import { handleError } from "@/utils/handleError";

// Stripe calls this when a checkout is paid, fails or expires.
// Stripe dashboard > Developers > Webhooks: add this URL with the events below
// and copy the signing secret to STRIPE_WEBHOOK_SECRET. On a dev machine:
//   stripe listen --forward-to localhost:3100/api/shop/webhook
// There is no login here: the Stripe signature proves who is calling.
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set - Stripe webhook refused");
    return NextResponse.json({ message: "Webhook not configured" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    // the signature is checked against the exact raw body
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch (error) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        // completed + "unpaid" = a bank payment still on its way; we wait
        // for async_payment_succeeded in that case
        await completeStripeSession(event.data.object as Stripe.Checkout.Session);
        break;

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.checkout) {
          await cancelCheckout(
            session.metadata.checkout,
            event.type == "checkout.session.expired"
              ? "Checkout expired"
              : "Payment failed",
          );
        }
        break;
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    // an error status makes Stripe try again later
    return handleError(error);
  }
}
