import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase-service";

const schema = z.object({
  code: z.string().min(3).max(32).regex(/^[A-Z0-9_-]+$/i),
  discount_percent: z.number().int().min(1).max(100),
  max_uses: z.number().int().min(1).nullable(),
  stripePromotionCodeId: z.string().max(128).nullable().optional()
});

const ensureAdmin = async () => {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    return profile?.role === "admin";
  } catch {
    return false;
  }
};

export async function GET() {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("promo_codes")
    .select("id, code, discount_percent, max_uses, active, uses, stripe_promotion_code_id")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "No se pudieron cargar los codigos" }, { status: 503 });
  }

  return NextResponse.json({ promos: data || [] });
}

export async function POST(request: Request) {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = schema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("promo_codes").insert({
    code: payload.data.code.toUpperCase(),
    discount_percent: payload.data.discount_percent,
    max_uses: payload.data.max_uses,
    stripe_promotion_code_id: payload.data.stripePromotionCodeId || null
  });

  if (error) {
    return NextResponse.json({ error: "No se pudo crear el codigo" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
