import { createBrowserClient } from "@supabase/ssr";
import { assertSupabasePublicEnv, publicEnv } from "@/lib/public-env";

export const createClient = () => {
  assertSupabasePublicEnv();
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
};
