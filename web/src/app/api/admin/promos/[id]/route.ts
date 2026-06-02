import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase-service";

const schema = z.object({
  active: z.boolean()
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = schema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("promo_codes")
    .update({ active: payload.data.active })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "No se pudo actualizar el codigo" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase.from("promo_codes").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: "No se pudo eliminar el codigo" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
