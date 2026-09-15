import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'
import SidebarNav from '@/components/SidebarNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col font-sans">
      {/* FIXED SIDEBAR (Desktop) */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-surface-container-lowest z-50 flex-col justify-between border-r border-surface-container-high/60">
        <div className="flex flex-col">
          {/* Brand Header */}
          <div className="h-16 px-space-md flex items-center gap-space-sm border-b border-surface-container-high/40">
            <div className="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center relative border border-primary-fixed/30 shadow-[0_0_10px_rgba(195,244,0,0.2)]">
              <span className="absolute top-0 left-0 text-[10px] text-primary-fixed leading-none font-mono">⌜</span>
              <span className="absolute bottom-0 right-0 text-[10px] text-primary-fixed leading-none font-mono">⌟</span>
              <span className="material-symbols-outlined text-[16px] text-primary-fixed">center_focus_strong</span>
            </div>
            <div className="flex flex-col">
              <span className="font-display text-sm tracking-tight uppercase text-white font-bold leading-none">
                MARKIFY
              </span>
              <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest mt-0.5">
                ATTENDANCE STUDIO
              </span>
            </div>
          </div>

          {/* Navigation */}
          <div className="px-space-sm pt-space-md">
            <SidebarNav />
          </div>
        </div>

        {/* Minimal Footer */}
        <div className="p-space-md border-t border-surface-container-high/40 bg-surface-container-lowest">
          <div className="flex items-center justify-between text-[10px] font-mono text-on-surface-variant">
            <span>MARKIFY v1.0</span>
            <span className="text-primary-fixed font-semibold">CONNECTED</span>
          </div>
        </div>
      </aside>

      {/* TOP HEADER (Across entire viewport, offset on desktop) */}
      <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-surface-container-high/60 z-40 flex items-center justify-between px-4 sm:px-gutter">
        {/* Left header: mobile brand */}
        <div className="flex items-center gap-space-md">
          {/* Mobile brand logo */}
          <Link href="/dashboard" className="flex lg:hidden items-center gap-2">
            <span className="w-6 h-6 rounded bg-surface-container-high flex items-center justify-center font-mono text-xs text-primary-fixed font-bold">
              M
            </span>
            <span className="font-display font-bold text-sm tracking-tight text-white uppercase">
              MARKIFY
            </span>
          </Link>

          {/* Mobile Navigation Links */}
          <nav className="flex lg:hidden items-center gap-2 text-xs font-mono">
            <Link href="/dashboard" className="text-on-surface-variant hover:text-white px-1 py-0.5">
              Dash
            </Link>
            <Link href="/dashboard/session" className="text-on-surface-variant hover:text-white px-1 py-0.5">
              Live
            </Link>
            <Link href="/dashboard/enroll" className="text-on-surface-variant hover:text-white px-1 py-0.5">
              Enroll
            </Link>
            <Link href="/dashboard/analytics" className="text-on-surface-variant hover:text-white px-1 py-0.5">
              Stats
            </Link>
          </nav>
        </div>

        {/* Right header: Operator profile & Logout */}
        <div className="flex items-center gap-3 sm:gap-space-md">
          <div className="flex items-center gap-space-sm pl-2 sm:pl-space-md sm:border-l sm:border-surface-container-high/60">
            <div className="flex flex-col text-right">
              <span className="font-sans text-xs font-semibold text-on-surface leading-tight max-w-[150px] sm:max-w-[220px] truncate">
                {user.email}
              </span>
              <span className="font-mono text-[9px] text-primary-fixed uppercase tracking-wider">
                PRIMARY OPERATOR
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-surface-container-high ring-1 ring-primary-fixed/40 flex items-center justify-center font-mono text-xs text-primary-fixed font-bold flex-shrink-0">
              {user.email?.[0]?.toUpperCase() || 'U'}
            </div>
          </div>
          <LogoutButton />
        </div>
      </header>

      {/* MAIN VIEWPORT BODY */}
      <main className="w-full pt-16 lg:pl-64 bg-background min-h-screen">
        <div className="p-4 sm:p-gutter lg:p-margin-lg max-w-[1720px] mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  )
}
