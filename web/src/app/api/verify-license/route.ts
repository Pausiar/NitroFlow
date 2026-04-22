import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase-service";

const schema = z.object({
  googleToken: z.string().min(10)
});

export async function POST(request: Request) {
  const payload = schema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json({ licensed: false, error: "Invalid payload" }, { status: 400 });
  }

  const tokenInfoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(payload.data.googleToken)}`,
    { cache: "no-store" }
  );

  if (!tokenInfoRes.ok) {
    return NextResponse.json({ licensed: false, error: "Invalid Google token" }, { status: 401 });
  }

  const tokenInfo = (await tokenInfoRes.json()) as { email?: string };
  if (!tokenInfo.email) {
    return NextResponse.json({ licensed: false, error: "Token without email" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("email", tokenInfo.email)
    .maybeSingle();

  return NextResponse.json({
    licensed: profile?.plan === "pro"
  });
}
