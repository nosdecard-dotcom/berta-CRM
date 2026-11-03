import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const isLogin = request.nextUrl.pathname.startsWith("/login");
  const isSignout = request.nextUrl.pathname.startsWith("/auth/signout");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Keep the login screen reachable so configuration errors are visible.
    if (isLogin) return response;
    const loginUrl = new URL("/login?error=config", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data: { claims }, error } = await supabase.auth.getClaims();
  if ((!claims || error) && !isLogin && !isSignout) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (claims && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}
