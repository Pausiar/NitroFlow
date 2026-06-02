import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertSupabasePublicEnv, env } from "@/lib/env";

export const createClient = async () => {
  assertSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        for (const cookie of cookiesToSet) {
          cookieStore.set(cookie.name, cookie.value, cookie.options);
        }
      }
    }
  });
};
