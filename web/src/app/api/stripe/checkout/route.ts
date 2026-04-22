import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase-server";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/stripe";

const bodySchema = z.object({
  promoCode: z.string().nullable().optional()
});

export async function POST(request: Request) {
  if (!env.stripeProPriceId) {
    return NextResponse.json({ error: "Missing STRIPE_PRO_PRICE_ID" }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let stripePromotionCodeId: string | undefined;
  let normalizedPromoCode: string | undefined;

  const rawPromo = parsed.data.promoCode?.trim().toUpperCase();
  if (rawPromo) {
    const { data: promo } = await supabase
      .from("promo_codes")
      .select("code, active, stripe_promotion_code_id")
      .eq("code", rawPromo)
      .single();

    if (!promo || !promo.active) {
      return NextResponse.json({ error: "Codigo promocional invalido" }, { status: 400 });
    }

    normalizedPromoCode = promo.code;
    stripePromotionCodeId = promo.stripe_promotion_code_id || undefined;
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: env.stripeProPriceId, quantity: 1 }],
    customer_email: user.email,
    success_url: `${env.appUrl}/dashboard?paid=1`,
    cancel_url: `${env.appUrl}/?canceled=1`,
    allow_promotion_codes: true,
    discounts: stripePromotionCodeId ? [{ promotion_code: stripePromotionCodeId }] : undefined,
    metadata: {
      userId: user.id,
      promoCode: normalizedPromoCode || ""
    }
  });

  return NextResponse.json({ url: session.url });
}
