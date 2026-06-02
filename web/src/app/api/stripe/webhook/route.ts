import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase-service";

export async function POST(request: Request) {
  if (!env.stripeWebhookSecret) {
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  }

  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, env.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const promoCode = session.metadata?.promoCode;

    if (userId) {
      const supabase = createServiceClient();
      await supabase.from("profiles").update({ plan: "pro" }).eq("id", userId);

      if (promoCode) {
        await supabase.rpc("increment_promo_usage", { promo_code_input: promoCode });
      }
    }
  }

  return NextResponse.json({ received: true });
}
