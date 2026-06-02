import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase-service";

const ensureAdmin = async () => {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return null;
    }

    return user;
  } catch {
    return null;
  }
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminUser = await ensureAdmin();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("tickets")
    .update({
      ai_enabled: false,
      claimed_by: adminUser.id,
      claimed_at: new Date().toISOString(),
      status: "open"
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "No se pudo asignar el ticket" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
