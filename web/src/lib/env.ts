import { assertSupabasePublicEnv, getMissingSupabasePublicEnv, publicEnv } from "@/lib/public-env";

const rawAppUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  "http://localhost:3000";

export const env = {
  appUrl: rawAppUrl.startsWith("http") ? rawAppUrl : `https://${rawAppUrl}`,
  supabaseUrl: publicEnv.supabaseUrl,
  supabaseAnonKey: publicEnv.supabaseAnonKey,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripeProPriceId: process.env.STRIPE_PRO_PRICE_ID || "",
  aiProviderBaseUrl:
    process.env.AI_PROVIDER_BASE_URL ||
    process.env.NVIDIA_NIM_BASE_URL ||
    "https://integrate.api.nvidia.com/v1",
  aiProviderApiKey: process.env.AI_PROVIDER_API_KEY || process.env.NVIDIA_NIM_API_KEY || "",
  aiProviderModel: process.env.AI_PROVIDER_MODEL || process.env.NVIDIA_NIM_MODEL || "z-ai/glm-5.1",
  googleClientId: process.env.GOOGLE_CLIENT_ID || ""
};

export const isSupabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseAnonKey);

export { assertSupabasePublicEnv, getMissingSupabasePublicEnv };

export const assertSupabaseServiceEnv = () => {
  assertSupabasePublicEnv();
  if (!env.supabaseServiceRoleKey) {
    throw new Error("Supabase service role no esta configurado.");
  }
};
