export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
};

export const isSupabasePublicConfigured = () =>
  Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);

export const getMissingSupabasePublicEnv = () =>
  [
    publicEnv.supabaseUrl ? null : "NEXT_PUBLIC_SUPABASE_URL",
    publicEnv.supabaseAnonKey ? null : "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  ].filter((item): item is string => Boolean(item));

export const assertSupabasePublicEnv = () => {
  const missing = getMissingSupabasePublicEnv();
  if (missing.length > 0) {
    throw new Error(`Supabase no esta configurado. Faltan: ${missing.join(", ")}.`);
  }
};
