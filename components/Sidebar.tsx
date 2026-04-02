'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Settings, LogOut, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface SidebarProps {
  user: { email: string; name: string }
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navItems = [
    { href: '/', label: 'Pipeline', icon: LayoutDashboard },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <aside className="w-56 flex flex-col text-slate-300 shrink-0" style={{backgroundColor: "#023a51"}}>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{backgroundColor: "#5ba200"}}>
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-white text-sm">Solas Dealflow</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            style={pathname === href ? {backgroundColor: 'rgba(91,162,0,0.25)'} : {}}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition',
              pathname === href
                ? 'text-white rounded-lg'
                : 'hover:text-white rounded-lg hover:bg-white/10'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="mb-2">
          <p className="text-xs font-medium text-white truncate">{user.name || user.email}</p>
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
