import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  // Only same-origin relative paths: "/x" but not "//host", "/\host", or
  // "@host"/".host" tricks — anything else is an open-redirect vector.
  const dest = /^\/(?![/\\])/.test(next) ? next : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      // An expired or replayed code must not look like a successful sign-in.
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Sign-in link expired or already used. Please try again.')}`)
    }
  }

  return NextResponse.redirect(`${origin}${dest}`)
}
