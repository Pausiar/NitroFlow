import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/env";

export async function middleware(request: NextRequest) {
  const protectedRoutes = ["/dashboard", "/support", "/admin"];
  const path = request.nextUrl.pathname;
  const requiresAuth = protectedRoutes.some((route) => path.startsWith(route));

  if (!requiresAuth) {
    return NextResponse.next({ request });
  }

  if (!isSupabaseConfigured()) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", path);
    loginUrl.searchParams.set("error", "supabase_config");
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          for (const cookie of cookiesToSet) {
            request.cookies.set(cookie.name, cookie.value);
            response.cookies.set(cookie.name, cookie.value, cookie.options);
          }
        }
      }
    });

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("next", path);
      return NextResponse.redirect(loginUrl);
    }
  } catch {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", path);
    loginUrl.searchParams.set("error", "supabase_unavailable");
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/support/:path*", "/admin/:path*"]
};
