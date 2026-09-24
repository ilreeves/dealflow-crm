import LoginForm from './LoginForm'

// ?error= is attacker-controllable (anyone can send a /login?error=… link), so
// it's never rendered verbatim — that would let a phishing link put arbitrary
// "support" text on the real login page. Known values map to fixed copy;
// anything else gets a generic message.
const LINK_EXPIRED = 'Sign-in link expired or already used. Please try again.'
const ERROR_MESSAGES: Record<string, string> = {
  link_expired: LINK_EXPIRED,
  // What /auth/callback passes today (the full sentence, URL-encoded) — kept so
  // that redirect keeps showing the same message.
  [LINK_EXPIRED]: LINK_EXPIRED,
  // Supabase's own codes for a dead email link, should one land here.
  otp_expired: LINK_EXPIRED,
  access_denied: LINK_EXPIRED,
}
const GENERIC_ERROR = 'Sign-in failed. Please try again.'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const { error } = await searchParams
  const code = Array.isArray(error) ? error[0] : error
  const message = code ? (Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : GENERIC_ERROR) : ''
  return <LoginForm initialError={message} />
}
