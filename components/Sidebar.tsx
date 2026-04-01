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
    <aside className="w-56 flex flex-col bg-slate-900 text-slate-300 shrink-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-slate-900" />
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
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition',
              pathname === href
                ? 'bg-slate-800 text-white'
                : 'hover:bg-slate-800 hover:text-white'
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
