export type AppRole = "user" | "admin";
export type Plan = "free" | "pro";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  plan: Plan;
  created_at: string;
  updated_at: string;
};

export type Ticket = {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: "open" | "closed";
  ai_response: string | null;
  ai_error_summary: string | null;
  created_at: string;
  updated_at: string;
};
