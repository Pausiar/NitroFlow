import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import type { Plan } from "@/lib/types";

type DesktopTokenPayload = {
  email: string;
  plan: Plan;
  exp: number;
};

const getSecret = () => env.desktopAuthSecret || env.supabaseServiceRoleKey;

const toBase64Url = (value: string | Buffer) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf8");
};

const sign = (payload: string) =>
  toBase64Url(createHmac("sha256", getSecret()).update(payload).digest());

export const createDesktopToken = (payload: Omit<DesktopTokenPayload, "exp">) => {
  const expiresInDays = 30;
  const body = toBase64Url(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60
    })
  );
  return `${body}.${sign(body)}`;
};

export const verifyDesktopToken = (token: string): DesktopTokenPayload | null => {
  const secret = getSecret();
  if (!secret) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(body)) as DesktopTokenPayload;
    if (!payload.email || !payload.plan || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};
