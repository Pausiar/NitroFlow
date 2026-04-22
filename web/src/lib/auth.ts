import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import type { Profile } from "@/lib/types";

export const getUserSession = async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
};

export const requireUser = async () => {
  const user = await getUserSession();
  if (!user) {
    redirect("/auth/login");
  }
  return user;
};

export const getProfileForCurrentUser = async (): Promise<Profile | null> => {
  const user = await getUserSession();
  if (!user) {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as Profile | null) || null;
};

export const requireAdmin = async () => {
  const profile = await getProfileForCurrentUser();
  if (!profile || profile.role !== "admin") {
    redirect("/dashboard");
  }
  return profile;
};
