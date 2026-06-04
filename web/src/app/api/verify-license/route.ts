import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase-service";
import { env } from "@/lib/env";
import { verifyDesktopToken } from "@/lib/desktop-token";
import type { Plan } from "@/lib/types";

const schema = z.object({
  googleToken: z.string().min(20).max(5000).optional(),
  desktopToken: z.string().min(20).max(5000).optional()
}).refine((value) => Boolean(value.googleToken || value.desktopToken));

type TokenInfo = {
  email?: string;
  email_verified?: string | boolean;
  aud?: string;
  exp?: string;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimit = new Map<string, RateLimitEntry>();

const json = (
  body: { licensed: boolean; success?: boolean; plan?: Plan | null; email?: string; error?: string },
  status = 200
) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

const getClientIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
};

const isRateLimited = (request: Request) => {
  const key = getClientIp(request);
  const now = Date.now();
  const entry = rateLimit.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  return false;
};

const isVerifiedEmail = (tokenInfo: TokenInfo) =>
  tokenInfo.email_verified === true || tokenInfo.email_verified === "true";

const isExpectedAudience = (tokenInfo: TokenInfo) => {
  if (!env.googleClientId) {
    return true;
  }
  return tokenInfo.aud === env.googleClientId;
};

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return json({ licensed: false }, 429);
  }

  let payload: z.infer<typeof schema>;
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ licensed: false }, 400);
    }
    payload = parsed.data;
  } catch {
    return json({ licensed: false }, 400);
  }

  if (payload.desktopToken) {
    const token = verifyDesktopToken(payload.desktopToken);
    if (!token) {
      return json({ success: false, licensed: false, plan: null, error: "Token no valido" }, 401);
    }

    return json({
      success: true,
      licensed: token.plan === "pro",
      plan: token.plan,
      email: token.email
    });
  }

  try {
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(payload.googleToken ?? "")}`,
      { cache: "no-store" }
    );

    if (!tokenInfoRes.ok) {
      return json({ licensed: false }, 401);
    }

    const tokenInfo = (await tokenInfoRes.json()) as TokenInfo;
    if (!tokenInfo.email || !isVerifiedEmail(tokenInfo) || !isExpectedAudience(tokenInfo)) {
      return json({ licensed: false }, 401);
    }

    const supabase = createServiceClient();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("plan")
      .eq("email", tokenInfo.email)
      .maybeSingle();

    if (error) {
      return json({ licensed: false }, 503);
    }

    const plan = (profile?.plan ?? "free") as Plan;
    return json({ success: true, licensed: plan === "pro", plan, email: tokenInfo.email });
  } catch {
    return json({ success: false, licensed: false, plan: null, error: "Servicio no disponible" }, 503);
  }
}
