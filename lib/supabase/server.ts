import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { requireSupabaseEnv } from "./env"

export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = requireSupabaseEnv()

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — cookies cannot be set
          }
        },
      },
    }
  )
}
