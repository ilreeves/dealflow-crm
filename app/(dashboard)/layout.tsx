import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import GlobalSearch from '@/components/GlobalSearch'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // maybeSingle: a user without a profile row is a real (if odd) state — log
  // it rather than treating it like the .single() error it isn't.
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()
  if (profileErr) console.error('profile load failed:', profileErr.message)
  else if (!profile) console.error(`no profiles row for user ${user.id}`)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar user={{ email: user.email ?? '', name: profile?.full_name ?? '' }} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <GlobalSearch />
    </div>
  )
}
