import { createClient } from "@supabase/supabase-js";
import { assertSupabaseServiceEnv, env } from "@/lib/env";

export const createServiceClient = () => {
  assertSupabaseServiceEnv();

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};
