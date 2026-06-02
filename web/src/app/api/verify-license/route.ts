import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase-service";
import { env } from "@/lib/env";

const schema = z.object({
  googleToken: z.string().min(20).max(5000)
});

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

const json = (body: { licensed: boolean }, status = 200) =>
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

  try {
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(payload.googleToken)}`,
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

    return json({ licensed: profile?.plan === "pro" });
  } catch {
    return json({ licensed: false }, 503);
  }
}
