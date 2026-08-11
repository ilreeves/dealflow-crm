import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { requireSupabaseEnv } from "@/lib/supabase/env"

export async function proxy(request: NextRequest) {
  // Public, unauthenticated deck share links (name/email gate handled in-page).
  // Exact segment match — a bare startsWith("/deck") would also exempt any
  // future /deck-something route from auth.
  const { pathname } = request.nextUrl
  if (pathname === "/deck" || pathname.startsWith("/deck/") || pathname.startsWith("/api/deck/")) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const { url: supabaseUrl, anonKey } = requireSupabaseEnv()
  const supabase = createServerClient(
    supabaseUrl,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims() verifies the JWT locally (WebCrypto) when the project uses
  // asymmetric signing keys — no per-navigation round-trip to the Auth server,
  // unlike getUser(). Falls back to a server request only for symmetric secrets.
  // An about-to-expire session is refreshed first, so cookie refresh still works.
  // Tradeoff: the token is trusted until it expires (~1hr), so revocation isn't
  // caught here instantly — the layout's getUser() still catches it on hard loads.
  const { data: claimsData } = await supabase.auth.getClaims()
  const user = claimsData?.claims ?? null
  // Routes reachable without a session. /reset-password must ALSO stay
  // reachable with one: the recovery email signs the user in, and bouncing
  // them to "/" would discard the ?code= before the password can be changed.
  // /auth/callback must be reachable logged-out or the code exchange it
  // exists to perform can never run — the redirect target is validated in
  // the route itself.
  const isPublicRoute = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/reset-password") ||
    request.nextUrl.pathname.startsWith("/auth/callback")
  const isAuthEntryRoute = request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/forgot-password")

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (user && isAuthEntryRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
