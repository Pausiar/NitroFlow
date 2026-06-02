import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const getSafeNextPath = (value: string | null) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  try {
    const parsed = new URL(value, "https://nitroflow.local");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
};

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth`);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(`${origin}/auth/login?error=auth`);
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user?.id && user.email) {
      await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata.full_name || user.user_metadata.name || null,
        avatar_url: user.user_metadata.avatar_url || null
      });
    }

    return NextResponse.redirect(`${origin}${next}`);
  } catch {
    return NextResponse.redirect(`${origin}/auth/login?error=supabase_unavailable`);
  }
}
